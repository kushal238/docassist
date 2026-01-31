import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Download, 
  Copy, 
  FileText, 
  Check,
  Loader2 
} from 'lucide-react';
import { toast } from 'sonner';
import { BriefContent } from '@/lib/api';

interface ExportBriefButtonProps {
  brief: BriefContent;
  patientName?: string;
}

export default function ExportBriefButton({ 
  brief, 
  patientName = 'Patient' 
}: ExportBriefButtonProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const formatBriefAsText = (): string => {
    const lines: string[] = [];
    const date = new Date().toLocaleDateString();
    
    lines.push(`CLINICAL BRIEF - ${patientName}`);
    lines.push(`Generated: ${date}`);
    lines.push('');
    lines.push('═'.repeat(50));
    lines.push('');

    if (brief.chiefComplaint) {
      lines.push(`CHIEF COMPLAINT: ${brief.chiefComplaint}`);
      lines.push('');
    }

    lines.push('EXECUTIVE SUMMARY');
    lines.push('-'.repeat(20));
    lines.push(brief.summary);
    lines.push('');

    if (brief.safetyAlerts?.length) {
      lines.push('⚠️ SAFETY ALERTS');
      lines.push('-'.repeat(20));
      brief.safetyAlerts.forEach(alert => lines.push(`• ${alert}`));
      lines.push('');
    }

    if (brief.clinicalInsights?.length) {
      lines.push('CLINICAL INSIGHTS');
      lines.push('-'.repeat(20));
      brief.clinicalInsights.forEach(insight => lines.push(`• ${insight}`));
      lines.push('');
    }

    if (brief.differentialConsiderations?.length) {
      lines.push('DIFFERENTIAL CONSIDERATIONS');
      lines.push('-'.repeat(20));
      brief.differentialConsiderations.forEach((diff, i) => lines.push(`${i + 1}. ${diff}`));
      lines.push('');
    }

    if (brief.actionableRecommendations?.length) {
      lines.push('ACTIONABLE RECOMMENDATIONS');
      lines.push('-'.repeat(20));
      brief.actionableRecommendations.forEach((rec, i) => lines.push(`${i + 1}. ${rec}`));
      lines.push('');
    }

    if (brief.relevantHistory?.length) {
      lines.push('RELEVANT HISTORY');
      lines.push('-'.repeat(20));
      brief.relevantHistory.forEach(item => lines.push(`• ${item}`));
      lines.push('');
    }

    if (brief.currentSymptoms?.length) {
      lines.push('CURRENT SYMPTOMS');
      lines.push('-'.repeat(20));
      brief.currentSymptoms.forEach(symptom => lines.push(`• ${symptom}`));
      lines.push('');
    }

    if (brief.medications?.length) {
      lines.push('MEDICATIONS');
      lines.push('-'.repeat(20));
      brief.medications.forEach(med => lines.push(`• ${med}`));
      lines.push('');
    }

    if (brief.allergies?.length) {
      lines.push('ALLERGIES');
      lines.push('-'.repeat(20));
      brief.allergies.forEach(allergy => lines.push(`⚠️ ${allergy}`));
      lines.push('');
    }

    if (brief.abnormalLabs?.length) {
      lines.push('ABNORMAL LABS');
      lines.push('-'.repeat(20));
      brief.abnormalLabs.forEach(lab => lines.push(`• ${lab}`));
      lines.push('');
    }

    if (brief.missingInfo?.length) {
      lines.push('MISSING INFORMATION');
      lines.push('-'.repeat(20));
      brief.missingInfo.forEach(info => lines.push(`• ${info}`));
      lines.push('');
    }

    lines.push('═'.repeat(50));
    lines.push('');
    lines.push('DISCLAIMER: Clinical decision support only — not a diagnosis.');
    lines.push('All conclusions should be verified with direct patient evaluation.');

    return lines.join('\n');
  };

  const copyToClipboard = async () => {
    try {
      const text = formatBriefAsText();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Clinical brief copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const exportAsPDF = async () => {
    setExporting(true);
    try {
      // Create a simple HTML document for printing
      const text = formatBriefAsText();
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Clinical Brief - ${patientName}</title>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
              line-height: 1.6;
            }
            h1 { 
              color: #0891b2; 
              border-bottom: 2px solid #0891b2; 
              padding-bottom: 10px;
            }
            h2 { 
              color: #374151; 
              margin-top: 24px;
              font-size: 16px;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 4px;
            }
            .alert { 
              background: #fef2f2; 
              border-left: 4px solid #ef4444; 
              padding: 12px; 
              margin: 16px 0; 
            }
            .disclaimer { 
              background: #f3f4f6; 
              padding: 16px; 
              margin-top: 32px; 
              font-size: 12px;
              border-radius: 4px;
            }
            ul { margin: 8px 0; padding-left: 20px; }
            li { margin: 4px 0; }
            .chief-complaint {
              background: #f0f9ff;
              padding: 12px;
              border-radius: 4px;
              margin-bottom: 16px;
            }
            pre { 
              white-space: pre-wrap; 
              font-family: inherit; 
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Give the window time to load before printing
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
      
      toast.success('PDF export ready - use browser print dialog to save');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsPDF}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyToClipboard}>
          {copied ? (
            <Check className="h-4 w-4 mr-2 text-success" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          Copy for EHR
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
