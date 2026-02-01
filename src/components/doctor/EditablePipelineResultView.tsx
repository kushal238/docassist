/**
 * Editable Pipeline Result View
 * 
 * Allows doctors to:
 * - View the deep analysis results
 * - Edit the clinical report
 * - Save changes to Supabase briefs table
 * - Revert to original analysis
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Pencil,
  Check,
  X,
  Save,
  RotateCcw,
  AlertTriangle,
  FileText,
  Loader2,
  ChevronDown,
  Sparkles,
  Brain,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ClinicalPipelineResult } from '@/services/clinical-pipeline';

// =============================================================================
// Types
// =============================================================================

interface EditablePipelineResultViewProps {
  patientId: string;
  analysisResult: ClinicalPipelineResult;
  onUpdate?: (updated: ClinicalPipelineResult) => void;
  readOnly?: boolean;
}

interface EditState {
  isEditing: boolean;
  value: string;
  originalValue: string;
}

// =============================================================================
// Main Component
// =============================================================================

export default function EditablePipelineResultView({
  patientId,
  analysisResult,
  onUpdate,
  readOnly = false,
}: EditablePipelineResultViewProps) {
  const { profile } = useAuth();
  const isDoctor = profile?.role === 'doctor';
  const canEdit = isDoctor && !readOnly;

  const [result, setResult] = useState<ClinicalPipelineResult>(analysisResult);
  const [originalResult] = useState<ClinicalPipelineResult>(analysisResult);
  const [editState, setEditState] = useState<EditState>({ 
    isEditing: false, 
    value: analysisResult.report, 
    originalValue: analysisResult.report 
  });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // =============================================================================
  // Edit Handlers
  // =============================================================================

  const startEdit = useCallback(() => {
    setEditState({ isEditing: true, value: result.report, originalValue: result.report });
  }, [result.report]);

  const cancelEdit = useCallback(() => {
    setEditState(prev => ({ ...prev, isEditing: false, value: prev.originalValue }));
  }, []);

  const saveEdit = useCallback(() => {
    const newResult = { ...result, report: editState.value };
    setResult(newResult);
    setHasChanges(true);
    setEditState(prev => ({ ...prev, isEditing: false, originalValue: editState.value }));
    onUpdate?.(newResult);
  }, [editState.value, result, onUpdate]);

  // =============================================================================
  // Persistence
  // =============================================================================

  const saveToSupabase = async () => {
    if (!hasChanges) return;
    
    setSaving(true);
    try {
      const { error } = await supabase.from('briefs').insert({
        patient_id: patientId,
        created_by_profile_id: profile?.id,
        content_json: JSON.parse(JSON.stringify({
          type: 'edited_deep_analysis',
          report: result.report,
          original_report: originalResult.report,
          edited_at: new Date().toISOString(),
        })),
      });

      if (error) throw error;

      toast.success('Changes saved', { description: 'Analysis updates saved to patient record' });
      setHasChanges(false);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save', { description: 'Please try again' });
    } finally {
      setSaving(false);
    }
  };

  const revertChanges = () => {
    setResult(originalResult);
    setEditState({ isEditing: false, value: originalResult.report, originalValue: originalResult.report });
    setHasChanges(false);
    onUpdate?.(originalResult);
    toast.info('Reverted to original', { description: 'All changes have been undone' });
  };

  // Parse the report to extract sections
  const parseReport = (report: string) => {
    const sections: { title: string; content: string }[] = [];
    const lines = report.split('\n');
    let currentSection = { title: 'Summary', content: '' };
    
    for (const line of lines) {
      // Look for section headers (usually marked with === or ### or ALL CAPS:)
      if (line.match(/^(===|###|[A-Z][A-Z\s]+:)/)) {
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }
        currentSection = { title: line.replace(/[=#]/g, '').trim(), content: '' };
      } else {
        currentSection.content += line + '\n';
      }
    }
    
    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }
    
    return sections.length > 0 ? sections : [{ title: 'Clinical Analysis', content: report }];
  };

  const sections = parseReport(result.report);

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="space-y-4">
      {/* Header with save/revert */}
      {canEdit && hasChanges && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>You have unsaved changes</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={revertChanges} disabled={saving}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Revert
            </Button>
            <Button size="sm" onClick={saveToSupabase} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* Main Report Content */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Clinical Analysis Report
            </CardTitle>
            {canEdit && !editState.isEditing && (
              <Button variant="ghost" size="sm" onClick={startEdit} className="h-7 text-xs">
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
          </div>
          <CardDescription className="text-xs">
            AI-generated analysis based on clinical notes and patient history
          </CardDescription>
        </CardHeader>
        <CardContent>
          {editState.isEditing ? (
            <div className="space-y-3">
              <Textarea
                value={editState.value}
                onChange={(e) => setEditState(prev => ({ ...prev, value: e.target.value }))}
                className="min-h-[300px] font-mono text-sm"
                placeholder="Edit the clinical report..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={saveEdit}>
                  <Check className="h-3 w-3 mr-1" />
                  Apply Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map((section, i) => (
                <div key={i}>
                  {section.title && section.title !== 'Clinical Analysis' && (
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      {section.title}
                    </h4>
                  )}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{section.content.trim()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reasoning Trace (Collapsed) */}
      {result.reasoning_trace && (
        <details className="group">
          <summary className="flex items-center justify-between p-2 bg-muted/30 rounded cursor-pointer text-xs text-muted-foreground hover:bg-muted/50">
            <span className="flex items-center gap-2">
              <FileText className="h-3 w-3" />
              View Clinical Reasoning Chain
            </span>
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 p-3 bg-muted/20 rounded-lg">
            <p className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
              {result.reasoning_trace}
            </p>
          </div>
        </details>
      )}

      {/* Metadata */}
      {result.metadata && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {result.metadata.stagesCompleted?.length || 0} stages
          </Badge>
          <span>•</span>
          <span>{(result.metadata.executionTimeMs / 1000).toFixed(1)}s execution time</span>
        </div>
      )}
    </div>
  );
}
