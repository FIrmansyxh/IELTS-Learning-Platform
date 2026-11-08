import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProfilePicker } from '@/components/profiles/profile-picker';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.profiles.title };

export default function ChooseProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePicker />
    </Suspense>
  );
}
