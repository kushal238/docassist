import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  FileText, 
  Sparkles,
  AlertTriangle,
  Pill,
  TestTube,
  Clock,
  Lightbulb,
  Stethoscope,
  ListChecks,
  ShieldAlert,
  AlertCircle,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import { generateBrief, BriefContent, Citation } from '@/lib/api';
import CitationChip from '@/components/CitationChip';

interface ClinicalBriefTabProps {
  patientId: string;
  existingBrief: BriefContent | null;
  onBriefGenerated: () => void;
}

export default function ClinicalBriefTab({ 
  patientId, 
  existingBrief,
  onBriefGenerated 
}: ClinicalBriefTabProps) {
  const { profile } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState<BriefContent | null>(existingBrief);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const handleGenerateBrief = async () => {
    setGenerating(true);
    try {
      const newBrief = await generateBrief(
        patientId, 
        chiefComplaint || undefined,
        clinicalNotes || undefined
      );
      setBrief(newBrief);

      // Save to database
      await supabase.from('briefs').insert({
        patient_id: patientId,
        created_by_profile_id: profile?.id,
        content_json: JSON.parse(JSON.stringify(newBrief)),
      });

      toast.success('Smart clinical brief generated');
      onBriefGenerated();
    } catch (error) {
      console.error('Error generating brief:', error);
      toast.error('Failed to generate brief');
    } finally {
      setGenerating(false);
    }
  };

  const renderCitations = (citations: Citation[] | undefined) => {
    if (!citations || citations.length === 0) return null;
    return (
      <div className="inline-flex flex-wrap gap-1 ml-2">
        {citations.map((citation, i) => (
          <CitationChip key={i} docName={citation.docName} page={citation.page} />
        ))}
      </div>
    );
  };

  const suggestedComplaints = [
    "Chest pain",
    "Shortness of breath", 
    "Headache",
    "Abdominal pain",
    "Fatigue",
    "Dizziness"
  ];

  if (!brief) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-primary/10 p-6 mb-6">
          <Sparkles className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Smart History Analysis</h3>
        <p className="text-muted-foreground text-center max-w-lg mb-6">
          Enter the patient's chief complaint for intelligent, context-aware analysis. 
          The AI will surface only relevant history and generate actionable clinical insights.
        </p>
        
        <div className="w-full max-w-md space-y-4 mb-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Chief Complaint</label>
            <Input
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="e.g., Chest pain, persistent headache..."
              className="text-center"
            />
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {suggestedComplaints.map((complaint) => (
                <Badge
                  key={complaint}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => setChiefComplaint(complaint)}
                >
                  {complaint}
                </Badge>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Additional Clinical Notes (Optional)</label>
            <Textarea
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="e.g., radiating to left arm, 20 minutes duration, occurred during exertion..."
              rows={2}
            />
          </div>
        </div>

        <Button size="lg" onClick={handleGenerateBrief} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Analyzing Records...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              {chiefComplaint ? 'Generate Smart Brief' : 'Generate General Brief'}
            </>
          )}
        </Button>
        
        <p className="text-xs text-muted-foreground mt-3">
          {chiefComplaint 
            ? "AI will filter history for relevance to this complaint" 
            : "Leave blank for a general pre-visit summary"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">Smart Clinical Brief</h2>
          {brief.chiefComplaint && (
            <div className="flex items-center gap-2 mt-1">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                Chief Complaint: <span className="font-medium text-foreground">{brief.chiefComplaint}</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder="New complaint..."
            className="w-48"
          />
          <Button variant="outline" onClick={handleGenerateBrief} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Regenerate
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Summary */}
        <Card className="card-healthcare border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed">
              {brief.summary}
              {renderCitations(brief.citations?.summary)}
            </p>
          </CardContent>
        </Card>

        {/* Safety Alerts - Always show first if present */}
        {brief.safetyAlerts && brief.safetyAlerts.length > 0 && (
          <Card className="card-healthcare border-l-4 border-l-destructive bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" />
                Safety Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.safetyAlerts.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <span className="font-medium">{item}</span>
                  </li>
                ))}
              </ul>
              {renderCitations(brief.citations?.safetyAlerts)}
            </CardContent>
          </Card>
        )}

        {/* Clinical Insights */}
        {brief.clinicalInsights && brief.clinicalInsights.length > 0 && (
          <Card className="card-healthcare border-l-4 border-l-warning">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-warning" />
                Clinical Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.clinicalInsights.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {renderCitations(brief.citations?.clinicalInsights)}
            </CardContent>
          </Card>
        )}

        {/* Differential Considerations */}
        {brief.differentialConsiderations && brief.differentialConsiderations.length > 0 && (
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Differential Considerations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.differentialConsiderations.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="font-medium text-primary mr-1">{i + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {renderCitations(brief.citations?.differentialConsiderations)}
            </CardContent>
          </Card>
        )}

        {/* Actionable Recommendations */}
        {brief.actionableRecommendations && brief.actionableRecommendations.length > 0 && (
          <Card className="card-healthcare border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                Actionable Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.actionableRecommendations.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Two-column layout for history sections */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Relevant History */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Relevant History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.relevantHistory.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {renderCitations(brief.citations?.relevantHistory)}
            </CardContent>
          </Card>

          {/* Current Symptoms */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Current Symptoms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.currentSymptoms.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Medications & Allergies */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Medications & Allergies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Medications</h4>
                <ul className="space-y-1">
                  {brief.medications.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Allergies</h4>
                <ul className="space-y-1">
                  {brief.allergies.map((item, i) => (
                    <li key={i} className="text-sm text-destructive">⚠️ {item}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Abnormal Labs */}
          <Card className="card-healthcare">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Abnormal Labs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {brief.abnormalLabs.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {renderCitations(brief.citations?.abnormalLabs)}
            </CardContent>
          </Card>
        </div>

        {/* Missing Info */}
        {brief.missingInfo && brief.missingInfo.length > 0 && (
          <Card className="card-healthcare border-l-4 border-l-muted-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-5 w-5" />
                Missing Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {brief.missingInfo.map((item, i) => (
                  <li key={i} className="text-sm text-muted-foreground">• {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
