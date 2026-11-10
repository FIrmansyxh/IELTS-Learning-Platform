'use client';

import { ResumeSection } from '@/components/home/resume-card';
import { cn } from '@/lib/utils';

/**
 * Kartu hero "Lanjutkan Belajar" pada bento grid. Memakai ResumeSection (SPEC-007) yang sudah menangani
 * kondisi RESUME / FALLBACK_NEXT / kosong / skeleton / galat, sehingga kontrak dan uji yang ada tetap berlaku.
 */
export function ResumeLearningCard({
  placementAvailable = false,
  className,
}: {
  placementAvailable?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('[&>*]:h-full', className)}>
      <ResumeSection placementAvailable={placementAvailable} />
    </div>
  );
}
