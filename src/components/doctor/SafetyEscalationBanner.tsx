import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CitationChip from '@/components/CitationChip';
import { Citation } from '@/lib/api';

interface SafetyPattern {
  pattern: string;
  urgency: 'critical' | 'high' | 'moderate';
  recommendation: string;
  citations?: Citation[];
}

interface SafetyEscalationBannerProps {
  safetyAlerts: string[];
  citations?: Citation[];
  patientId?: string;
  onViewEvidence?: () => void;
}

// Known high-risk clinical patterns
const HIGH_RISK_PATTERNS = [
  { keywords: ['fever', 'neck stiffness'], condition: 'Possible meningitis' },
  { keywords: ['chest pain', 'shortness of breath'], condition: 'Possible cardiac event' },
  { keywords: ['sudden', 'severe headache'], condition: 'Possible intracranial event' },
  { keywords: ['crushing', 'chest', 'radiating'], condition: 'Possible MI' },
  { keywords: ['suicidal', 'self-harm'], condition: 'Psychiatric emergency' },
  { keywords: ['allergic', 'anaphylaxis'], condition: 'Possible anaphylaxis' },
  { keywords: ['altered mental status', 'confusion'], condition: 'Possible encephalopathy' },
  { keywords: ['hypotension', 'tachycardia', 'fever'], condition: 'Possible sepsis' },
];

function detectHighRiskPatterns(alerts: string[]): SafetyPattern[] {
  const detected: SafetyPattern[] = [];
  const alertsLower = alerts.map(a => a.toLowerCase()).join(' ');

  for (const pattern of HIGH_RISK_PATTERNS) {
    const matchCount = pattern.keywords.filter(kw => alertsLower.includes(kw.toLowerCase())).length;
    if (matchCount >= 2 || (pattern.keywords.length === 1 && matchCount === 1)) {
      detected.push({
        pattern: pattern.condition,
        urgency: 'critical',
        recommendation: 'Urgent clinical evaluation recommended',
      });
    }
  }

  // Also flag any alert containing critical keywords
  const criticalKeywords = ['urgent', 'emergency', 'immediate', 'critical', 'life-threatening', 'stat'];
  alerts.forEach(alert => {
    const alertLower = alert.toLowerCase();
    if (criticalKeywords.some(kw => alertLower.includes(kw))) {
      const existing = detected.find(d => d.pattern === alert);
      if (!existing) {
        detected.push({
          pattern: alert,
          urgency: 'high',
          recommendation: 'Requires prompt attention',
        });
      }
    }
  });

  return detected;
}

export default function SafetyEscalationBanner({
  safetyAlerts,
  citations,
  patientId,
  onViewEvidence,
}: SafetyEscalationBannerProps) {
  const detectedPatterns = detectHighRiskPatterns(safetyAlerts);
  
  // Only show banner if high-risk patterns detected or if there are multiple safety alerts
  if (detectedPatterns.length === 0 && safetyAlerts.length < 2) {
    return null;
  }

  const hasCritical = detectedPatterns.some(p => p.urgency === 'critical');

  return (
    <Alert 
      variant="destructive" 
      className={`
        border-2 animate-pulse-subtle mb-6
        ${hasCritical ? 'bg-destructive/10 border-destructive' : 'bg-warning/10 border-warning'}
      `}
    >
      <AlertTriangle className={`h-5 w-5 ${hasCritical ? 'text-destructive' : 'text-warning'}`} />
      <AlertTitle className="text-lg font-bold flex items-center gap-2">
        {hasCritical ? 'Urgent Clinical Evaluation Recommended' : 'Safety Alert'}
        {hasCritical && (
          <Badge variant="destructive" className="animate-pulse">
            CRITICAL
          </Badge>
        )}
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <div className="space-y-2">
          {detectedPatterns.map((pattern, i) => (
            <div key={i} className="flex items-start gap-2">
              <Badge 
                variant={pattern.urgency === 'critical' ? 'destructive' : 'outline'}
                className="text-[10px] mt-0.5"
              >
                {pattern.urgency.toUpperCase()}
              </Badge>
              <div className="flex-1">
                <span className="font-medium">{pattern.pattern}</span>
                <span className="text-muted-foreground ml-2">— {pattern.recommendation}</span>
              </div>
            </div>
          ))}
        </div>

        {safetyAlerts.length > 0 && (
          <div className="text-sm space-y-1 pt-2 border-t border-border/50">
            <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
              Related Safety Findings:
            </p>
            <ul className="space-y-1">
              {safetyAlerts.slice(0, 3).map((alert, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-destructive">•</span>
                  <span>{alert}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            <span className="text-xs text-muted-foreground mr-1">Evidence:</span>
            {citations.slice(0, 3).map((citation, i) => (
              <CitationChip 
                key={i} 
                docName={citation.docName} 
                page={citation.page}
                patientId={patientId}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground italic pt-2 border-t border-border/50">
          This is an AI-generated safety alert. Clinical correlation and professional judgment required.
        </p>
      </AlertDescription>
    </Alert>
  );
}
