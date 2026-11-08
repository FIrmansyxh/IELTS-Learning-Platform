import { SimulationResultView } from '@/components/simulation/simulation-result';

export const metadata = {
  title: 'Hasil Simulasi Tes IELTS GT | IELTS Learning Platform',
  description: 'Hasil simulasi tes IELTS General Training.',
};

export default async function SimulationResultPage({
  params,
}: {
  params: Promise<{ attempt_id: string }>;
}) {
  const { attempt_id } = await params;
  return <SimulationResultView attemptId={attempt_id} />;
}
