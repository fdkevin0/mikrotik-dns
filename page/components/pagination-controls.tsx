import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  page: number;
  onPrevious: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  className?: string;
}

export function PaginationControls({
  page,
  onPrevious,
  onNext,
  nextDisabled,
  className,
}: PaginationControlsProps) {
  return (
    <div className={cn("flex justify-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={page === 1}
      >
        Previous
      </Button>
      <span className="px-3 py-1 text-sm">Page {page}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={nextDisabled}
      >
        Next
      </Button>
    </div>
  );
}
