/**
 * Editable Pipeline Result View
 * 
 * Allows doctors to inline-edit the deep analysis report sections.
 * Features:
 * - Click to edit any section
 * - Save edits to Supabase
 * - Preserve original analysis trace
 * - Show edit history
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Edit2,
  Save,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Target,
  Lightbulb,
  ShieldAlert,
  Plus,
  Trash2,
  History,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ClinicalPipelineResult, DiagnosticEngineResult, DifferentialDiagnosis, CantMissDiagnosis } from '@/services/clinical-pipeline';
import { cn } from '@/lib/utils';
import DeepAnalysisChatbot from './DeepAnalysisChatbot';

// =============================================================================
// Types
// =============================================================================

interface EditablePipelineResultViewProps {
  result: ClinicalPipelineResult;
  patientId: string;
  patientName?: string;
  chiefComplaint?: string;
  briefId?: string;
  onUpdate?: (updatedResult: ClinicalPipelineResult) => void;
  className?: string;
}

interface EditState {
  isEditing: boolean;
  section: string | null;
  originalValue: any;
}

// =============================================================================
// Component
// =============================================================================

export default function EditablePipelineResultView({
  result,
  patientId,
  patientName,
  chiefComplaint,
  briefId,
  onUpdate,
  className,
}: EditablePipelineResultViewProps) {
  const { profile } = useAuth();
  const isDoctor = profile?.role === 'doctor';
  
  const [localResult, setLocalResult] = useState<ClinicalPipelineResult>(result);
  const [editState, setEditState] = useState<EditState>({
    isEditing: false,
    section: null,
    originalValue: null,
  });
  const [showTrace, setShowTrace] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editHistory, setEditHistory] = useState<Array<{ section: string; timestamp: Date; previousValue: any }>>([]);

  // Sync with prop changes
  useEffect(() => {
    setLocalResult(result);
  }, [result]);

  // =============================================================================
  // Edit handlers
  // =============================================================================

  const startEdit = (section: string, currentValue: any) => {
    if (!isDoctor) {
      toast.error('Only doctors can edit the analysis');
      return;
    }
    setEditState({
      isEditing: true,
      section,
      originalValue: currentValue,
    });
  };

  const cancelEdit = () => {
    setEditState({
      isEditing: false,
      section: null,
      originalValue: null,
    });
  };

  const saveEdit = async (section: string, newValue: any) => {
    if (!isDoctor) return;
    
    setSaving(true);
    try {
      // Create a deep copy and update the specific section
      const updatedResult = JSON.parse(JSON.stringify(localResult)) as ClinicalPipelineResult;
      
      // Update the appropriate section
      switch (section) {
        case 'assessment_summary':
          if (updatedResult.diagnosticEngine) {
            updatedResult.diagnosticEngine.assessment_summary = newValue;
          }
          break;
        case 'reasoning_trace':
          if (updatedResult.diagnosticEngine) {
            updatedResult.diagnosticEngine.reasoning_trace = newValue;
          }
          break;
        case 'most_likely':
          if (updatedResult.diagnosticEngine?.differential) {
            updatedResult.diagnosticEngine.differential.most_likely = newValue;
          }
          break;
        case 'cant_miss':
          if (updatedResult.diagnosticEngine?.differential) {
            updatedResult.diagnosticEngine.differential.cant_miss = newValue;
          }
          break;
        case 'suggested_plan':
          if (updatedResult.diagnosticEngine) {
            updatedResult.diagnosticEngine.suggested_plan = newValue;
          }
          break;
        default:
          console.warn('[EditablePipelineResultView] Unknown section:', section);
      }
      
      // Save to Supabase if we have a brief ID
      if (briefId) {
        const { error } = await supabase
          .from('briefs')
          .update({
            content_json: {
              type: 'deep_analysis_edited',
              deepAnalysis: updatedResult,
              lastEditedBy: profile?.id,
              lastEditedAt: new Date().toISOString(),
              chiefComplaint,
            } as any,
          })
          .eq('id', briefId);
          
        if (error) throw error;
      }
      
      // Track edit history
      setEditHistory(prev => [
        ...prev,
        { section, timestamp: new Date(), previousValue: editState.originalValue }
      ]);
      
      // Update local state
      setLocalResult(updatedResult);
      
      // Notify parent
      if (onUpdate) {
        onUpdate(updatedResult);
      }
      
      toast.success('Analysis updated');
      cancelEdit();
      
    } catch (error) {
      console.error('[EditablePipelineResultView] Save error:', error);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const revertToOriginal = () => {
    setLocalResult(result);
    setEditHistory([]);
    toast.success('Reverted to original analysis');
    setShowRevertDialog(false);
  };

  // =============================================================================
  // Render helpers
  // =============================================================================

  const formatExecutionTime = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const de = localResult.diagnosticEngine;
  const cl = localResult.clinicalLens;

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with metadata */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {formatExecutionTime(localResult.metadata.executionTimeMs)}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {localResult.metadata.stagesCompleted.length} stages
          </Badge>
          {editHistory.length > 0 && (
            <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/50">
              <Edit2 className="h-3 w-3 mr-1" />
              {editHistory.length} edit{editHistory.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        
        {isDoctor && editHistory.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRevertDialog(true)}
            className="text-xs"
          >
            <Undo2 className="h-3 w-3 mr-1" />
            Revert to Original
          </Button>
        )}
      </div>

      {/* Assessment Summary - Editable */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Assessment Summary
            </CardTitle>
            {isDoctor && !editState.isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEdit('assessment_summary', de?.assessment_summary)}
                className="h-8"
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editState.isEditing && editState.section === 'assessment_summary' ? (
            <EditableTextArea
              value={de?.assessment_summary || ''}
              onSave={(value) => saveEdit('assessment_summary', value)}
              onCancel={cancelEdit}
              saving={saving}
            />
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                {de?.assessment_summary || localResult.report || 'No summary available'}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Most Likely Diagnoses - Editable */}
      {de?.differential?.most_likely && de.differential.most_likely.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-blue-500" />
                Most Likely Diagnoses
              </CardTitle>
              {isDoctor && !editState.isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit('most_likely', de.differential?.most_likely)}
                  className="h-8"
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editState.isEditing && editState.section === 'most_likely' ? (
              <EditableDifferentialList
                diagnoses={de.differential.most_likely}
                onSave={(value) => saveEdit('most_likely', value)}
                onCancel={cancelEdit}
                saving={saving}
              />
            ) : (
              <div className="space-y-3">
                {de.differential.most_likely.map((dx, i) => (
                  <DiagnosisCard key={i} diagnosis={dx} index={i + 1} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Can't Miss Diagnoses - Editable */}
      {de?.differential?.cant_miss && de.differential.cant_miss.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg text-red-600 dark:text-red-400">
                <ShieldAlert className="h-5 w-5" />
                Can't Miss Diagnoses
              </CardTitle>
              {isDoctor && !editState.isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit('cant_miss', de.differential?.cant_miss)}
                  className="h-8"
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editState.isEditing && editState.section === 'cant_miss' ? (
              <EditableCantMissList
                diagnoses={de.differential.cant_miss}
                onSave={(value) => saveEdit('cant_miss', value)}
                onCancel={cancelEdit}
                saving={saving}
              />
            ) : (
              <div className="space-y-3">
                {de.differential.cant_miss.map((dx, i) => (
                  <CantMissCard key={i} diagnosis={dx} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clinical Reasoning Trace - Collapsible */}
      <Collapsible open={showTrace} onOpenChange={setShowTrace}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Clinical Reasoning Trace
            </span>
            {showTrace ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Thought Process
                </CardTitle>
                {isDoctor && !editState.isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit('reasoning_trace', de?.reasoning_trace)}
                    className="h-7 text-xs"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editState.isEditing && editState.section === 'reasoning_trace' ? (
                <EditableTextArea
                  value={de?.reasoning_trace || ''}
                  onSave={(value) => saveEdit('reasoning_trace', value)}
                  onCancel={cancelEdit}
                  saving={saving}
                  rows={10}
                />
              ) : (
                <ScrollArea className="max-h-[300px]">
                  <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                    {de?.reasoning_trace || localResult.reasoning_trace || 'No reasoning trace available'}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Deep Analysis Chatbot */}
      <DeepAnalysisChatbot
        patientId={patientId}
        patientName={patientName}
        deepAnalysis={localResult}
        chiefComplaint={chiefComplaint}
        onAnalysisUpdate={(updated) => {
          setLocalResult(updated);
          if (onUpdate) onUpdate(updated);
        }}
      />

      {/* Revert Confirmation Dialog */}
      <AlertDialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Original Analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard all {editHistory.length} edit{editHistory.length !== 1 ? 's' : ''} and restore the original AI-generated analysis. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revertToOriginal}>
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface EditableTextAreaProps {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  saving: boolean;
  rows?: number;
}

function EditableTextArea({ value, onSave, onCancel, saving, rows = 5 }: EditableTextAreaProps) {
  const [localValue, setLocalValue] = useState(value);
  
  return (
    <div className="space-y-2">
      <Textarea
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        rows={rows}
        className="font-mono text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(localValue)} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

interface EditableDifferentialListProps {
  diagnoses: DifferentialDiagnosis[];
  onSave: (diagnoses: DifferentialDiagnosis[]) => void;
  onCancel: () => void;
  saving: boolean;
}

function EditableDifferentialList({ diagnoses, onSave, onCancel, saving }: EditableDifferentialListProps) {
  const [localDiagnoses, setLocalDiagnoses] = useState<DifferentialDiagnosis[]>(diagnoses);
  
  const updateDiagnosis = (index: number, field: keyof DifferentialDiagnosis, value: any) => {
    const updated = [...localDiagnoses];
    updated[index] = { ...updated[index], [field]: value };
    setLocalDiagnoses(updated);
  };
  
  const addDiagnosis = () => {
    setLocalDiagnoses([...localDiagnoses, {
      diagnosis: '',
      confidence: 0.5,
      supporting_evidence: [],
      contradicting_evidence: [],
    }]);
  };
  
  const removeDiagnosis = (index: number) => {
    setLocalDiagnoses(localDiagnoses.filter((_, i) => i !== index));
  };
  
  return (
    <div className="space-y-4">
      {localDiagnoses.map((dx, i) => (
        <div key={i} className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={dx.diagnosis || ''}
              onChange={(e) => updateDiagnosis(i, 'diagnosis', e.target.value)}
              placeholder="Diagnosis name"
              className="flex-1"
            />
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={dx.confidence || 0}
              onChange={(e) => updateDiagnosis(i, 'confidence', parseFloat(e.target.value))}
              className="w-20"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeDiagnosis(i)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={dx.supporting_evidence?.join('\n') || ''}
            onChange={(e) => updateDiagnosis(i, 'supporting_evidence', e.target.value.split('\n').filter(Boolean))}
            placeholder="Supporting evidence (one per line)"
            rows={2}
            className="text-sm"
          />
        </div>
      ))}
      
      <Button variant="outline" size="sm" onClick={addDiagnosis}>
        <Plus className="h-4 w-4 mr-1" />
        Add Diagnosis
      </Button>
      
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(localDiagnoses)} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

interface EditableCantMissListProps {
  diagnoses: CantMissDiagnosis[];
  onSave: (diagnoses: CantMissDiagnosis[]) => void;
  onCancel: () => void;
  saving: boolean;
}

function EditableCantMissList({ diagnoses, onSave, onCancel, saving }: EditableCantMissListProps) {
  const [localDiagnoses, setLocalDiagnoses] = useState<CantMissDiagnosis[]>(diagnoses);
  
  const updateDiagnosis = (index: number, field: keyof CantMissDiagnosis, value: any) => {
    const updated = [...localDiagnoses];
    updated[index] = { ...updated[index], [field]: value };
    setLocalDiagnoses(updated);
  };
  
  const addDiagnosis = () => {
    setLocalDiagnoses([...localDiagnoses, {
      diagnosis: '',
      urgency: 'HIGH',
      rule_out_strategy: '',
      red_flags: [],
      time_sensitive: true,
    }]);
  };
  
  const removeDiagnosis = (index: number) => {
    setLocalDiagnoses(localDiagnoses.filter((_, i) => i !== index));
  };
  
  return (
    <div className="space-y-4">
      {localDiagnoses.map((dx, i) => (
        <div key={i} className="p-3 border border-red-500/30 rounded-lg space-y-2 bg-red-500/5">
          <div className="flex items-center gap-2">
            <Input
              value={dx.diagnosis || ''}
              onChange={(e) => updateDiagnosis(i, 'diagnosis', e.target.value)}
              placeholder="Diagnosis name"
              className="flex-1"
            />
            <Input
              value={dx.urgency || ''}
              onChange={(e) => updateDiagnosis(i, 'urgency', e.target.value)}
              placeholder="Urgency"
              className="w-28"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeDiagnosis(i)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={dx.rule_out_strategy || ''}
            onChange={(e) => updateDiagnosis(i, 'rule_out_strategy', e.target.value)}
            placeholder="Rule-out strategy"
            rows={2}
            className="text-sm"
          />
          <Input
            value={dx.red_flags?.join(', ') || ''}
            onChange={(e) => updateDiagnosis(i, 'red_flags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="Red flags (comma separated)"
            className="text-sm"
          />
        </div>
      ))}
      
      <Button variant="outline" size="sm" onClick={addDiagnosis} className="border-red-500/30">
        <Plus className="h-4 w-4 mr-1" />
        Add Critical Diagnosis
      </Button>
      
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(localDiagnoses)} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

interface DiagnosisCardProps {
  diagnosis: DifferentialDiagnosis;
  index: number;
}

function DiagnosisCard({ diagnosis, index }: DiagnosisCardProps) {
  const confidence = (diagnosis.confidence || 0) * 100;
  
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">
          {index}. {diagnosis.diagnosis}
        </span>
        <Badge variant="outline" className="text-xs">
          {confidence.toFixed(0)}%
        </Badge>
      </div>
      <Progress value={confidence} className="h-1.5 mb-2" />
      
      {diagnosis.supporting_evidence && diagnosis.supporting_evidence.length > 0 && (
        <div className="text-xs text-muted-foreground mt-2">
          <span className="font-medium text-green-600 dark:text-green-400">Supporting: </span>
          {diagnosis.supporting_evidence.join(', ')}
        </div>
      )}
      
      {diagnosis.contradicting_evidence && diagnosis.contradicting_evidence.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-red-600 dark:text-red-400">Against: </span>
          {diagnosis.contradicting_evidence.join(', ')}
        </div>
      )}
      
      {diagnosis.next_steps && diagnosis.next_steps.length > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          <span className="font-medium">Next: </span>
          {diagnosis.next_steps.join(', ')}
        </div>
      )}
    </div>
  );
}

interface CantMissCardProps {
  diagnosis: CantMissDiagnosis;
}

function CantMissCard({ diagnosis }: CantMissCardProps) {
  return (
    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-red-600 dark:text-red-400">
          {diagnosis.diagnosis}
        </span>
        <Badge variant="destructive" className="text-xs">
          {diagnosis.urgency}
        </Badge>
      </div>
      
      <div className="text-sm mb-2">
        <span className="font-medium">Rule-out: </span>
        {diagnosis.rule_out_strategy}
      </div>
      
      {diagnosis.red_flags && diagnosis.red_flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {diagnosis.red_flags.map((flag, i) => (
            <Badge key={i} variant="outline" className="text-[10px] border-red-500/50 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {flag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
