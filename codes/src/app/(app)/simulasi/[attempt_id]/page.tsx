import { SimulationRunner } from '@/components/simulation/simulation-runner';

export const metadata = {
  title: 'Ujian Simulasi IELTS GT | IELTS Learning Platform',
  description: 'Simulasi tes IELTS General Training.',
};

export default async function SimulationRunnerPage({
  params,
}: {
  params: Promise<{ attempt_id: string }>;
}) {
  const { attempt_id } = await params;
  return <SimulationRunner attemptId={attempt_id} />;
}
