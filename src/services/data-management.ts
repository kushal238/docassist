/**
 * Data Management Service
 * 
 * Role-based CRUD operations:
 * - Doctors: Full CRUD (Add + Remove)
 * - Patients: Add-only (no delete)
 */

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type UserRole = 'doctor' | 'patient';

export interface DeleteResult {
  success: boolean;
  error?: string;
}

// =============================================================================
// Role Checking
// =============================================================================

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

export async function isDoctor(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'doctor';
}

export async function canDelete(): Promise<boolean> {
  return isDoctor();
}

// =============================================================================
// Document Operations
// =============================================================================

export async function deleteDocument(documentId: string, storagePath: string): Promise<DeleteResult> {
  try {
    if (!(await canDelete())) {
      return { success: false, error: 'Only doctors can delete documents' };
    }

    await supabase.storage.from('documents').remove([storagePath]);
    const { error } = await supabase.from('documents').delete().eq('id', documentId);
    if (error) throw error;

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' };
  }
}

// =============================================================================
// Symptom Operations
// =============================================================================

export async function deleteSymptom(symptomId: string): Promise<DeleteResult> {
  try {
    if (!(await canDelete())) {
      return { success: false, error: 'Only doctors can delete symptoms' };
    }

    const { error } = await supabase.from('symptoms').delete().eq('id', symptomId);
    if (error) throw error;

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' };
  }
}

// =============================================================================
// Brief Operations
// =============================================================================

export async function updateBrief(briefId: string, contentJson: any): Promise<DeleteResult> {
  try {
    if (!(await isDoctor())) {
      return { success: false, error: 'Only doctors can update briefs' };
    }

    const { error } = await supabase
      .from('briefs')
      .update({ content_json: contentJson })
      .eq('id', briefId);
    if (error) throw error;

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update' };
  }
}

export async function deleteBrief(briefId: string): Promise<DeleteResult> {
  try {
    if (!(await canDelete())) {
      return { success: false, error: 'Only doctors can delete briefs' };
    }

    const { error } = await supabase.from('briefs').delete().eq('id', briefId);
    if (error) throw error;

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' };
  }
}

// =============================================================================
// Toast Helpers
// =============================================================================

export async function withToast<T extends DeleteResult>(
  operation: Promise<T>,
  successMsg: string,
  errorMsg: string
): Promise<T> {
  const result = await operation;
  if (result.success) {
    toast.success(successMsg);
  } else {
    toast.error(result.error || errorMsg);
  }
  return result;
}
