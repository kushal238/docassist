/**
 * Data Management Service
 * 
 * Role-based CRUD operations for Supabase:
 * - Doctors: Full CRUD (Add + Remove) for documents, symptoms, patients
 * - Patients: Add-only (no delete permissions)
 */

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export type UserRole = 'doctor' | 'patient';

export interface DeleteResult {
  success: boolean;
  error?: string;
}

export interface DataItem {
  id: string;
  [key: string]: unknown;
}

// =============================================================================
// Role Checking
// =============================================================================

/**
 * Get the current user's role from their profile
 */
export async function getCurrentUserRole(): Promise<UserRole | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role as UserRole | null;
}

/**
 * Check if the current user is a doctor
 */
export async function isDoctor(): Promise<boolean> {
  const role = await getCurrentUserRole();
  return role === 'doctor';
}

/**
 * Check if the current user can delete data (doctors only)
 */
export async function canDelete(): Promise<boolean> {
  return isDoctor();
}

// =============================================================================
// Document Operations
// =============================================================================

/**
 * Upload a document (both doctors and patients can add)
 */
export async function uploadDocument(
  patientId: string,
  file: File,
  docType: 'note' | 'lab' | 'imaging' | 'meds' | 'other',
  uploaderId: string
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    const documentId = crypto.randomUUID();
    const storagePath = `patient/${patientId}/${documentId}.pdf`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // Create document record
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        patient_id: patientId,
        uploader_profile_id: uploaderId,
        storage_path: storagePath,
        filename: file.name,
        doc_type: docType,
        status: 'pending',
      });

    if (docError) throw docError;

    return { success: true, documentId };
  } catch (error) {
    console.error('[DataManagement] Upload document error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload document',
    };
  }
}

/**
 * Delete a document (doctors only)
 * - Deletes from storage
 * - Deletes document record
 * - Cascades to doc_chunks
 */
export async function deleteDocument(
  documentId: string,
  storagePath: string
): Promise<DeleteResult> {
  try {
    // Verify user is a doctor
    const canDeleteDoc = await canDelete();
    if (!canDeleteDoc) {
      return {
        success: false,
        error: 'Only doctors can delete documents',
      };
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([storagePath]);

    if (storageError) {
      console.warn('[DataManagement] Storage delete warning:', storageError);
      // Continue anyway - the record delete is more important
    }

    // Delete document record (cascades to doc_chunks)
    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (docError) throw docError;

    return { success: true };
  } catch (error) {
    console.error('[DataManagement] Delete document error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete document',
    };
  }
}

// =============================================================================
// Symptom Operations
// =============================================================================

/**
 * Add a symptom (both doctors and patients can add)
 */
export async function addSymptom(
  patientId: string,
  description: string,
  onsetDate?: string,
  severity?: number
): Promise<{ success: boolean; symptomId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('symptoms')
      .insert({
        patient_id: patientId,
        description: description.trim(),
        onset_date: onsetDate || null,
        severity: severity || null,
      })
      .select('id')
      .single();

    if (error) throw error;

    return { success: true, symptomId: data.id };
  } catch (error) {
    console.error('[DataManagement] Add symptom error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add symptom',
    };
  }
}

/**
 * Delete a symptom (doctors only)
 */
export async function deleteSymptom(symptomId: string): Promise<DeleteResult> {
  try {
    // Verify user is a doctor
    const canDeleteSymptom = await canDelete();
    if (!canDeleteSymptom) {
      return {
        success: false,
        error: 'Only doctors can delete symptoms',
      };
    }

    const { error } = await supabase
      .from('symptoms')
      .delete()
      .eq('id', symptomId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('[DataManagement] Delete symptom error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete symptom',
    };
  }
}

// =============================================================================
// Brief Operations
// =============================================================================

/**
 * Delete a brief (doctors only)
 */
export async function deleteBrief(briefId: string): Promise<DeleteResult> {
  try {
    const canDeleteBrief = await canDelete();
    if (!canDeleteBrief) {
      return {
        success: false,
        error: 'Only doctors can delete briefs',
      };
    }

    const { error } = await supabase
      .from('briefs')
      .delete()
      .eq('id', briefId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('[DataManagement] Delete brief error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete brief',
    };
  }
}

/**
 * Update a brief (doctors only)
 */
export async function updateBrief(
  briefId: string,
  contentJson: unknown
): Promise<DeleteResult> {
  try {
    const canUpdateBrief = await canDelete(); // Same permission as delete
    if (!canUpdateBrief) {
      return {
        success: false,
        error: 'Only doctors can update briefs',
      };
    }

    const { error } = await supabase
      .from('briefs')
      .update({ content_json: contentJson as any })
      .eq('id', briefId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('[DataManagement] Update brief error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update brief',
    };
  }
}

// =============================================================================
// Patient Operations
// =============================================================================

/**
 * Delete a patient (doctors only)
 * WARNING: This cascades to all related data
 */
export async function deletePatient(patientId: string): Promise<DeleteResult> {
  try {
    const canDeletePatient = await canDelete();
    if (!canDeletePatient) {
      return {
        success: false,
        error: 'Only doctors can delete patients',
      };
    }

    // First, get all documents to delete from storage
    const { data: documents } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('patient_id', patientId);

    // Delete files from storage
    if (documents && documents.length > 0) {
      const paths = documents.map(d => d.storage_path);
      await supabase.storage.from('documents').remove(paths);
    }

    // Delete patient (cascades to documents, symptoms, briefs, etc.)
    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', patientId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('[DataManagement] Delete patient error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete patient',
    };
  }
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Delete multiple documents (doctors only)
 */
export async function deleteDocuments(
  documents: Array<{ id: string; storagePath: string }>
): Promise<DeleteResult> {
  try {
    const canDeleteDocs = await canDelete();
    if (!canDeleteDocs) {
      return {
        success: false,
        error: 'Only doctors can delete documents',
      };
    }

    // Delete from storage
    const paths = documents.map(d => d.storagePath);
    await supabase.storage.from('documents').remove(paths);

    // Delete records
    const ids = documents.map(d => d.id);
    const { error } = await supabase
      .from('documents')
      .delete()
      .in('id', ids);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('[DataManagement] Delete documents error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete documents',
    };
  }
}

/**
 * Delete multiple symptoms (doctors only)
 */
export async function deleteSymptoms(symptomIds: string[]): Promise<DeleteResult> {
  try {
    const canDeleteSymptoms = await canDelete();
    if (!canDeleteSymptoms) {
      return {
        success: false,
        error: 'Only doctors can delete symptoms',
      };
    }

    const { error } = await supabase
      .from('symptoms')
      .delete()
      .in('id', symptomIds);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('[DataManagement] Delete symptoms error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete symptoms',
    };
  }
}

// =============================================================================
// Helper: UI Toast Wrapper
// =============================================================================

/**
 * Wrapper that shows toast notifications for operations
 */
export function withToast<T extends (...args: any[]) => Promise<DeleteResult>>(
  fn: T,
  successMessage: string,
  errorMessage: string
): T {
  return (async (...args: Parameters<T>) => {
    const result = await fn(...args);
    if (result.success) {
      toast.success(successMessage);
    } else {
      toast.error(result.error || errorMessage);
    }
    return result;
  }) as T;
}
