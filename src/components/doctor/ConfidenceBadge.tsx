import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  Info
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type ConfidenceLevel = 'high' | 'moderate' | 'limited' | 'unknown';

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  dataSource?: string; // e.g., "Based on lab results and clinical notes"
  className?: string;
}

const confidenceConfig: Record<ConfidenceLevel, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
  description: string;
}> = {
  high: {
    label: 'High confidence',
    icon: CheckCircle2,
    className: 'bg-success/10 text-success border-success/20',
    description: 'Based on multiple corroborating sources with clear documentation',
  },
  moderate: {
    label: 'Moderate confidence',
    icon: AlertCircle,
    className: 'bg-warning/10 text-warning border-warning/20',
    description: 'Based on available documentation with some gaps or ambiguity',
  },
  limited: {
    label: 'Limited data',
    icon: HelpCircle,
    className: 'bg-muted text-muted-foreground border-muted-foreground/20',
    description: 'Based on minimal documentation; exercise clinical judgment',
  },
  unknown: {
    label: 'Data quality unknown',
    icon: Info,
    className: 'bg-secondary text-secondary-foreground border-secondary-foreground/20',
    description: 'Unable to assess data quality for this section',
  },
};

export default function ConfidenceBadge({ 
  level, 
  dataSource,
  className 
}: ConfidenceBadgeProps) {
  const config = confidenceConfig[level];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              'text-[10px] font-medium cursor-help gap-1 px-1.5 py-0',
              config.className,
              className
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{config.description}</p>
          {dataSource && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {dataSource}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Utility to determine confidence based on citation count and data availability
export function determineConfidence(
  citations: number,
  hasLabData: boolean,
  hasDocumentation: boolean,
  hasPatientReportedOnly: boolean
): { level: ConfidenceLevel; source: string } {
  if (citations >= 3 && hasLabData && hasDocumentation) {
    return { 
      level: 'high', 
      source: 'Based on lab results, clinical documentation, and multiple sources' 
    };
  }
  
  if (citations >= 1 && (hasLabData || hasDocumentation)) {
    return { 
      level: 'moderate', 
      source: 'Based on available clinical documentation' 
    };
  }
  
  if (hasPatientReportedOnly) {
    return { 
      level: 'limited', 
      source: 'This conclusion is based only on patient-reported symptoms' 
    };
  }
  
  if (citations > 0) {
    return { 
      level: 'moderate', 
      source: 'Based on limited documentation' 
    };
  }
  
  return { 
    level: 'limited', 
    source: 'Limited supporting documentation available' 
  };
}
