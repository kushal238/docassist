import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';

interface CitationChipProps {
  docName: string;
  page: number;
  className?: string;
}

export default function CitationChip({ docName, page, className }: CitationChipProps) {
  return (
    <span
      className={cn(
        "citation-chip inline-flex items-center gap-1 ml-1",
        className
      )}
      title={`${docName}, page ${page}`}
    >
      <FileText className="h-3 w-3" />
      <span className="truncate max-w-[100px]">{docName}</span>
      <span className="text-muted-foreground">p.{page}</span>
    </span>
  );
}
