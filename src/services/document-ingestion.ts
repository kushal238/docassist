/**
 * Document Ingestion Service
 * 
 * Extracts PLAIN TEXT from uploaded documents (PDFs) and stores in Supabase.
 * 
 * DESIGN PRINCIPLES:
 * - NO Computer Vision / OCR (cost-prohibitive)
 * - Conservative extraction - only text layer from PDFs
 * - Plain text storage in doc_chunks for RAG/embedding
 * - Doctor-only delete permissions
 */

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export interface DocumentChunk {
  id?: string;
  document_id: string;
  patient_id: string;
  chunk_text: string;
  page_num: number | null;
}

export interface IngestionResult {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  totalCharacters: number;
  error?: string;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Conservative chunking settings to minimize storage/embedding costs
 */
const CONFIG = {
  // Maximum characters per chunk (smaller = more precise retrieval, more chunks)
  MAX_CHUNK_SIZE: 1500,
  
  // Overlap between chunks for context continuity
  CHUNK_OVERLAP: 200,
  
  // Skip pages with very little content (likely headers/footers only)
  MIN_PAGE_CONTENT_LENGTH: 50,
  
  // Maximum total document size to process (prevent abuse)
  MAX_DOCUMENT_SIZE_MB: 10,
  
  // Rate limit: max pages to process per document
  MAX_PAGES_TO_PROCESS: 50,
};

// =============================================================================
// PDF Text Extraction (NO COMPUTER VISION)
// =============================================================================

/**
 * Extract plain text from PDF using PDF.js text layer
 * This is the ONLY extraction method - no OCR, no vision APIs
 */
async function extractTextFromPDF(file: File): Promise<{ pages: { pageNum: number; text: string }[] }> {
  // Dynamically import PDF.js to avoid bundling issues
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker source (required for PDF.js)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const pages: { pageNum: number; text: string }[] = [];
  const pagesToProcess = Math.min(pdf.numPages, CONFIG.MAX_PAGES_TO_PROCESS);
  
  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Extract text items and join
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim();
    
    // Skip pages with minimal content
    if (pageText.length >= CONFIG.MIN_PAGE_CONTENT_LENGTH) {
      pages.push({ pageNum: i, text: pageText });
    }
  }
  
  return { pages };
}

/**
 * Extract text from plain text files
 */
async function extractTextFromTextFile(file: File): Promise<{ pages: { pageNum: number; text: string }[] }> {
  const text = await file.text();
  return {
    pages: [{ pageNum: 1, text: text.trim() }]
  };
}

// =============================================================================
// Text Chunking
// =============================================================================

/**
 * Split text into chunks with overlap for better retrieval
 */
function chunkText(text: string, pageNum: number | null): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  if (text.length <= CONFIG.MAX_CHUNK_SIZE) {
    // Small text - single chunk
    chunks.push({
      document_id: '', // Will be set later
      patient_id: '', // Will be set later
      chunk_text: text,
      page_num: pageNum,
    });
    return chunks;
  }
  
  // Split by sentences first for natural boundaries
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  
  let currentChunk = '';
  let chunkPageNum = pageNum;
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > CONFIG.MAX_CHUNK_SIZE && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        document_id: '',
        patient_id: '',
        chunk_text: currentChunk.trim(),
        page_num: chunkPageNum,
      });
      
      // Start new chunk with overlap (last portion of previous)
      const overlapStart = Math.max(0, currentChunk.length - CONFIG.CHUNK_OVERLAP);
      currentChunk = currentChunk.substring(overlapStart) + sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      document_id: '',
      patient_id: '',
      chunk_text: currentChunk.trim(),
      page_num: chunkPageNum,
    });
  }
  
  return chunks;
}

// =============================================================================
// Main Ingestion Function
// =============================================================================

/**
 * Ingest a document: extract plain text and store chunks in Supabase
 * 
 * @param documentId - UUID of the document record in Supabase
 * @param patientId - UUID of the patient
 * @param file - The uploaded file (PDF or text)
 * @param showToast - Whether to show progress toasts
 */
export async function ingestDocument(
  documentId: string,
  patientId: string,
  file: File,
  showToast = true
): Promise<IngestionResult> {
  const startTime = Date.now();
  
  try {
    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > CONFIG.MAX_DOCUMENT_SIZE_MB) {
      throw new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Maximum: ${CONFIG.MAX_DOCUMENT_SIZE_MB}MB`);
    }
    
    if (showToast) {
      toast.info('Extracting text from document...');
    }
    
    // Extract text based on file type
    let extractedPages: { pageNum: number; text: string }[];
    
    if (file.type === 'application/pdf') {
      const result = await extractTextFromPDF(file);
      extractedPages = result.pages;
    } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      const result = await extractTextFromTextFile(file);
      extractedPages = result.pages;
    } else {
      // For other file types, try to read as text
      try {
        const result = await extractTextFromTextFile(file);
        extractedPages = result.pages;
      } catch {
        throw new Error(`Unsupported file type: ${file.type}. Only PDF and text files are supported.`);
      }
    }
    
    if (extractedPages.length === 0) {
      throw new Error('No text content found in document. The file may be scanned/image-based (OCR not supported).');
    }
    
    // Create chunks from all pages
    const allChunks: DocumentChunk[] = [];
    let totalCharacters = 0;
    
    for (const page of extractedPages) {
      totalCharacters += page.text.length;
      const pageChunks = chunkText(page.text, page.pageNum);
      
      // Set document and patient IDs
      for (const chunk of pageChunks) {
        chunk.document_id = documentId;
        chunk.patient_id = patientId;
        allChunks.push(chunk);
      }
    }
    
    if (allChunks.length === 0) {
      throw new Error('Failed to create text chunks from document.');
    }
    
    if (showToast) {
      toast.info(`Storing ${allChunks.length} text chunks...`);
    }
    
    // Store chunks in Supabase
    const { error: chunkError } = await supabase
      .from('doc_chunks')
      .insert(allChunks.map(c => ({
        document_id: c.document_id,
        patient_id: c.patient_id,
        chunk_text: c.chunk_text,
        page_num: c.page_num,
      })));
    
    if (chunkError) {
      console.error('[DocumentIngestion] Chunk insert error:', chunkError);
      throw new Error('Failed to store document chunks in database.');
    }
    
    // Update document status to processed
    await supabase
      .from('documents')
      .update({ status: 'processed' })
      .eq('id', documentId);
    
    const elapsed = Date.now() - startTime;
    console.log(`[DocumentIngestion] Completed in ${elapsed}ms: ${allChunks.length} chunks, ${totalCharacters} chars`);
    
    if (showToast) {
      toast.success(`Document processed: ${allChunks.length} text sections extracted`);
    }
    
    return {
      success: true,
      documentId,
      chunksCreated: allChunks.length,
      totalCharacters,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during ingestion';
    console.error('[DocumentIngestion] Error:', message);
    
    if (showToast) {
      toast.error(message);
    }
    
    // Update document status to indicate failure
    await supabase
      .from('documents')
      .update({ status: 'pending' }) // Keep as pending for retry
      .eq('id', documentId);
    
    return {
      success: false,
      documentId,
      chunksCreated: 0,
      totalCharacters: 0,
      error: message,
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all text chunks for a document
 */
export async function getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
  const { data, error } = await supabase
    .from('doc_chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('page_num', { ascending: true });
  
  if (error) {
    console.error('[DocumentIngestion] Error fetching chunks:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get all text for a patient (for RAG context building)
 */
export async function getPatientDocumentText(patientId: string): Promise<string> {
  const { data, error } = await supabase
    .from('doc_chunks')
    .select('chunk_text, page_num')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('[DocumentIngestion] Error fetching patient text:', error);
    return '';
  }
  
  return (data || []).map(c => c.chunk_text).join('\n\n');
}

/**
 * Delete all chunks for a document (doctor-only, enforced by RLS)
 */
export async function deleteDocumentChunks(documentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('doc_chunks')
    .delete()
    .eq('document_id', documentId);
  
  if (error) {
    console.error('[DocumentIngestion] Error deleting chunks:', error);
    return false;
  }
  
  return true;
}
