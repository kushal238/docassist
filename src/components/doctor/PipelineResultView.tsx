import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Lightbulb,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { ClinicalPipelineResult } from '@/services/clinical-pipeline';
import { cn } from '@/lib/utils';

interface PipelineResultViewProps {
  result: ClinicalPipelineResult;
  className?: string;
}

/**
 * Component to display the clinical pipeline results with expandable trace data.
 */
export default function PipelineResultView({ result, className }: PipelineResultViewProps) {
  const [showTrace, setShowTrace] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const formatExecutionTime = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Final Report Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Clinical Analysis Report
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {formatExecutionTime(result.metadata.executionTimeMs)}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {result.metadata.stagesCompleted.length}/4 stages
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {result.report}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Thought Process Toggle */}
      <Collapsible open={showTrace} onOpenChange={setShowTrace}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Thought Process (Pipeline Trace)
            </span>
            {showTrace ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 space-y-3">
          {/* Stage 1: Extracted History */}
          <TraceSection
            title="Stage 1: Extracted History"
            icon={<FileText className="h-4 w-4" />}
            traceId={result.metadata.traceIds.extraction}
            isExpanded={expandedSections.has('history')}
            onToggle={() => toggleSection('history')}
          >
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[200px]">
              {JSON.stringify(result.trace_data.extractedHistory, null, 2)}
            </pre>
          </TraceSection>

          {/* Stage 2: Filtered Findings */}
          <TraceSection
            title="Stage 2: Relevance Filtering"
            icon={<Filter className="h-4 w-4" />}
            traceId={result.metadata.traceIds.filtering}
            isExpanded={expandedSections.has('filtering')}
            onToggle={() => toggleSection('filtering')}
          >
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[200px]">
              {typeof result.trace_data.filteredFindings === 'string'
                ? result.trace_data.filteredFindings
                : JSON.stringify(result.trace_data.filteredFindings, null, 2)}
            </pre>
          </TraceSection>

          {/* Stage 3: Clinical Reasoning */}
          <TraceSection
            title="Stage 3: Clinical Reasoning (CoT)"
            icon={<Lightbulb className="h-4 w-4" />}
            traceId={result.metadata.traceIds.reasoning}
            isExpanded={expandedSections.has('reasoning')}
            onToggle={() => toggleSection('reasoning')}
          >
            <ScrollArea className="max-h-[300px]">
              <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                {result.trace_data.clinicalReasoning}
              </div>
            </ScrollArea>
          </TraceSection>

          {/* Stage 4: Synthesis info */}
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Stage 4: Synthesis Complete</span>
                </div>
                {result.metadata.traceIds.synthesis && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {result.metadata.traceIds.synthesis.slice(0, 12)}...
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

interface TraceSectionProps {
  title: string;
  icon: React.ReactNode;
  traceId?: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function TraceSection({
  title,
  icon,
  traceId,
  isExpanded,
  onToggle,
  children,
}: TraceSectionProps) {
  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {icon}
                <span className="text-sm font-medium">{title}</span>
              </div>
              <div className="flex items-center gap-2">
                {traceId && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {traceId.slice(0, 12)}...
                  </Badge>
                )}
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-4">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// =============================================================================
// Error Display Component
// =============================================================================

interface PipelineErrorViewProps {
  error: { message: string; stage?: string; traceId: string | null } | Error;
  onRetry?: () => void;
}

export function PipelineErrorView({ error, onRetry }: PipelineErrorViewProps) {
  const isStructuredError = 'traceId' in error;
  const message = isStructuredError ? error.message : error.message;
  const stage = isStructuredError ? error.stage : (error as any).stage;
  const traceId = isStructuredError ? error.traceId : (error as any).traceId;

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-destructive text-lg">
          <AlertCircle className="h-5 w-5" />
          Pipeline Error
          {stage && (
            <Badge variant="destructive" className="ml-2">
              Stage: {stage}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{message}</p>
        
        {traceId && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Trace ID for debugging:</span>{' '}
            <code className="bg-muted px-1 py-0.5 rounded">{traceId}</code>
          </div>
        )}

        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
