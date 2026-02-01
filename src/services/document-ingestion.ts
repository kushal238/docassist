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

const CONFIG = {
  MAX_CHUNK_SIZE: 1500,
  CHUNK_OVERLAP: 200,
  MIN_PAGE_CONTENT_LENGTH: 50,
  MAX_DOCUMENT_SIZE_MB: 10,
  MAX_PAGES_TO_PROCESS: 50,
};

// =============================================================================
// PDF Text Extraction (NO COMPUTER VISION)
// =============================================================================

async function extractTextFromPDF(file: File): Promise<{ pages: { pageNum: number; text: string }[] }> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const pages: { pageNum: number; text: string }[] = [];
  const pagesToProcess = Math.min(pdf.numPages, CONFIG.MAX_PAGES_TO_PROCESS);
  
  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (pageText.length >= CONFIG.MIN_PAGE_CONTENT_LENGTH) {
      pages.push({ pageNum: i, text: pageText });
    }
  }
  
  return { pages };
}

async function extractTextFromTextFile(file: File): Promise<{ pages: { pageNum: number; text: string }[] }> {
  const text = await file.text();
  return { pages: [{ pageNum: 1, text: text.trim() }] };
}

// =============================================================================
// Text Chunking
// =============================================================================

function chunkText(text: string, pageNum: number | null): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  if (text.length <= CONFIG.MAX_CHUNK_SIZE) {
    chunks.push({ document_id: '', patient_id: '', chunk_text: text, page_num: pageNum });
    return chunks;
  }
  
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > CONFIG.MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({ document_id: '', patient_id: '', chunk_text: currentChunk.trim(), page_num: pageNum });
      const overlapStart = Math.max(0, currentChunk.length - CONFIG.CHUNK_OVERLAP);
      currentChunk = currentChunk.substring(overlapStart) + sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push({ document_id: '', patient_id: '', chunk_text: currentChunk.trim(), page_num: pageNum });
  }
  
  return chunks;
}

// =============================================================================
// Main Ingestion Function
// =============================================================================

export async function ingestDocument(
  file: File,
  patientId: string,
  showToast = true
): Promise<IngestionResult & { chunkCount?: number }> {
  let documentId = '';
  
  try {
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > CONFIG.MAX_DOCUMENT_SIZE_MB) {
      throw new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Maximum: ${CONFIG.MAX_DOCUMENT_SIZE_MB}MB`);
    }
    
    // Create the document record first
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        patient_id: patientId,
        filename: file.name,
        doc_type: file.type === 'application/pdf' ? 'other' : 'other',
        status: 'pending',
        storage_path: `documents/${patientId}/${Date.now()}_${file.name}`,
      })
      .select('id')
      .single();
    
    if (docError || !docData) {
      throw new Error('Failed to create document record');
    }
    
    documentId = docData.id;
    
    if (showToast) toast.info('Extracting text from document...');
    
    let extractedPages: { pageNum: number; text: string }[];
    
    if (file.type === 'application/pdf') {
      extractedPages = (await extractTextFromPDF(file)).pages;
    } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      extractedPages = (await extractTextFromTextFile(file)).pages;
    } else {
      try {
        extractedPages = (await extractTextFromTextFile(file)).pages;
      } catch {
        throw new Error(`Unsupported file type: ${file.type}. Only PDF and text files are supported.`);
      }
    }
    
    if (extractedPages.length === 0) {
      throw new Error('No text content found. The file may be scanned/image-based (OCR not supported).');
    }
    
    const allChunks: DocumentChunk[] = [];
    let totalCharacters = 0;
    
    for (const page of extractedPages) {
      totalCharacters += page.text.length;
      const pageChunks = chunkText(page.text, page.pageNum);
      for (const chunk of pageChunks) {
        chunk.document_id = documentId;
        chunk.patient_id = patientId;
        allChunks.push(chunk);
      }
    }
    
    if (allChunks.length === 0) {
      throw new Error('Failed to create text chunks from document.');
    }
    
    if (showToast) toast.info(`Storing ${allChunks.length} text chunks...`);
    
    const { error: chunkError } = await supabase
      .from('doc_chunks')
      .insert(allChunks.map(c => ({
        document_id: c.document_id,
        patient_id: c.patient_id,
        chunk_text: c.chunk_text,
        page_num: c.page_num,
      })));
    
    if (chunkError) throw new Error('Failed to store document chunks.');
    
    await supabase.from('documents').update({ status: 'processed' }).eq('id', documentId);
    
    if (showToast) toast.success(`Document processed: ${allChunks.length} text sections extracted`);
    
    return { success: true, documentId, chunksCreated: allChunks.length, totalCharacters, chunkCount: allChunks.length };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (showToast) toast.error(message);
    if (documentId) {
      await supabase.from('documents').update({ status: 'pending' }).eq('id', documentId);
    }
    return { success: false, documentId, chunksCreated: 0, totalCharacters: 0, error: message };
  }
}

export async function getPatientDocumentText(patientId: string): Promise<string> {
  const { data } = await supabase
    .from('doc_chunks')
    .select('chunk_text')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });
  return (data || []).map(c => c.chunk_text).join('\n\n');
}

export async function deleteDocumentChunks(documentId: string): Promise<boolean> {
  const { error } = await supabase.from('doc_chunks').delete().eq('document_id', documentId);
  return !error;
}
