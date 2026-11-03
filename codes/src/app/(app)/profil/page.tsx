import type { Metadata } from 'next';
import { ProfileCard } from '@/components/auth/profile-card';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.profile.title };

export default function ProfilePage() {
  return <ProfileCard />;
}
