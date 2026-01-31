import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FileText, ExternalLink } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CitationChipProps {
  docName: string;
  page: number;
  snippet?: string;
  patientId?: string;
  documentId?: string;
  className?: string;
}

export default function CitationChip({ 
  docName, 
  page, 
  snippet,
  patientId,
  documentId,
  className 
}: CitationChipProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    
    try {
      // Try to find the document and get signed URL
      if (documentId) {
        const { data: doc } = await supabase
          .from('documents')
          .select('storage_path')
          .eq('id', documentId)
          .single();

        if (doc?.storage_path) {
          const { data: signedUrl } = await supabase.storage
            .from('documents')
            .createSignedUrl(doc.storage_path, 3600);

          if (signedUrl?.signedUrl) {
            // Open PDF at specific page using PDF.js page anchor
            window.open(`${signedUrl.signedUrl}#page=${page}`, '_blank');
            return;
          }
        }
      }

      // Fallback: try to find by filename if no documentId
      if (patientId) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, storage_path')
          .eq('patient_id', patientId)
          .ilike('filename', `%${docName}%`)
          .limit(1);

        if (docs?.[0]?.storage_path) {
          const { data: signedUrl } = await supabase.storage
            .from('documents')
            .createSignedUrl(docs[0].storage_path, 3600);

          if (signedUrl?.signedUrl) {
            window.open(`${signedUrl.signedUrl}#page=${page}`, '_blank');
            return;
          }
        }
      }

      toast.info(`Citation: ${docName}, page ${page}`);
    } catch (error) {
      console.error('Error opening document:', error);
      toast.info(`Citation: ${docName}, page ${page}`);
    } finally {
      setLoading(false);
    }
  };

  const previewSnippet = snippet || `Reference from ${docName}, page ${page}. Click to view the full document.`;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          onClick={handleClick}
          disabled={loading}
          className={cn(
            "citation-chip inline-flex items-center gap-1 ml-1 cursor-pointer transition-all",
            "hover:bg-primary/20 hover:scale-105 active:scale-95",
            loading && "opacity-50 cursor-wait",
            className
          )}
          title={`${docName}, page ${page} - Click to open`}
        >
          <FileText className="h-3 w-3" />
          <span className="truncate max-w-[100px]">{docName}</span>
          <span className="text-muted-foreground">p.{page}</span>
          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent 
        className="w-80 text-sm" 
        side="top"
        align="start"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-primary" />
            <span className="truncate">{docName}</span>
            <span className="text-muted-foreground">Page {page}</span>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3">
            {previewSnippet}
          </p>
          <div className="flex items-center gap-1 text-xs text-primary pt-1">
            <ExternalLink className="h-3 w-3" />
            <span>Click to open document</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
