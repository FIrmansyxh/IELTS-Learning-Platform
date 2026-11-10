'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CheckCircle2, XCircle, ChevronRight, BarChart2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBandPredictions, useExamHistory } from '@/hooks/use-skills';
import { useMe } from '@/hooks/use-auth';
import { id } from '@/i18n/id';
import { formatDate } from '@/lib/format';

export function ExamHistoryView() {
  const [activeTab, setActiveTab] = React.useState<'exam' | 'ai'>('exam');
  const predictionsQ = useBandPredictions({ page_size: 50 });
  const historyQ = useExamHistory({ page_size: 20 });

  const me = useMe();
  const targetBand = me.data?.target_band ?? null;
  const predictions = predictionsQ.data?.data ?? [];
  const history = historyQ.data?.data ?? [];

  const chartData = predictions.map((p) => ({
    date: formatDate(p.created_at),
    band: p.overall_band,
    trigger: p.trigger === 'BOSS' ? 'Boss Stage' : 'Evaluasi',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{id.history.title}</h1>
        <p className="text-sm text-muted-foreground">
          Pantau perkembangan perkiraan band IELTS dan hasil seluruh ujian Anda.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'exam' | 'ai')}>
        <TabsList>
          <TabsTrigger value="exam">{id.history.tabExam}</TabsTrigger>
          <TabsTrigger value="ai">{id.history.tabAi}</TabsTrigger>
        </TabsList>

        <TabsContent value="exam" className="space-y-6 pt-4">
          {/* Grafik Perkembangan Band */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">{id.history.chartTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {predictionsQ.isLoading ? (
                <Skeleton className="h-60 w-full" />
              ) : chartData.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <BarChart2 className="size-8 stroke-[1.5] text-muted-foreground/60" />
                  <p>{id.history.chartEmpty}</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: -16 }}>
                        <defs>
                          <linearGradient id="band-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 4" stroke="var(--color-border)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="var(--color-border-strong)"
                          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[4, 9]}
                          ticks={[4, 5, 6, 7, 8, 9]}
                          stroke="var(--color-border-strong)"
                          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        {targetBand !== null ? (
                          <ReferenceLine
                            y={Number(targetBand)}
                            stroke="var(--color-accent)"
                            strokeDasharray="6 4"
                            label={{ value: `Target ${Number(targetBand).toFixed(1)}`, fill: 'var(--color-accent-text)', fontSize: 11, position: 'insideTopRight' }}
                          />
                        ) : null}
                        <Tooltip
                          cursor={{ stroke: 'var(--color-border-strong)' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0]?.payload as (typeof chartData)[number];
                            if (!item) return null;
                            return (
                              <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                                <p className="font-semibold text-popover-foreground">{item.date}</p>
                                <p className="font-bold text-primary">Band {item.band.toFixed(1)}</p>
                                <p className="text-muted-foreground">{item.trigger}</p>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="band"
                          stroke="var(--chart-1)"
                          strokeWidth={3}
                          fill="url(#band-area)"
                          isAnimationActive={false}
                          dot={(p: { cx?: number; cy?: number; payload?: (typeof chartData)[number]; index?: number }) => (
                            <circle
                              key={p.index}
                              cx={p.cx}
                              cy={p.cy}
                              r={5}
                              fill={p.payload?.trigger === 'Boss Stage' ? 'var(--chart-4)' : 'var(--chart-1)'}
                              stroke="var(--color-surface)"
                              strokeWidth={2}
                            />
                          )}
                          activeDot={{ r: 7 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="Keterangan grafik">
                    <li className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-4)' }} /> Boss Stage
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-1)' }} /> Evaluasi
                    </li>
                    {targetBand !== null ? (
                      <li className="flex items-center gap-1.5">
                        <span className="h-0.5 w-4" style={{ background: 'var(--color-accent)' }} /> Target band
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabel Riwayat Ujian */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">{id.history.tableTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {historyQ.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : history.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{id.history.empty}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">{id.history.tableDate}</th>
                        <th className="pb-2 font-medium">{id.history.tableType}</th>
                        <th className="pb-2 font-medium">{id.history.tableScore}</th>
                        <th className="pb-2 font-medium">{id.history.tableBand}</th>
                        <th className="pb-2 font-medium">{id.history.tableResult}</th>
                        <th className="pb-2 text-right font-medium">{id.history.tableAction}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {history.map((item) => (
                        <tr key={item.attempt_id} className="hover:bg-muted/30">
                          <td className="py-3 text-muted-foreground">
                            {formatDate(item.submitted_at ?? '')}
                          </td>
                          <td className="py-3 font-medium">{item.title}</td>
                          <td className="py-3 text-muted-foreground">
                            {item.score_percent !== null ? `${item.score_percent.toFixed(1)}%` : '-'}
                          </td>
                          <td className="py-3 font-semibold">
                            {item.band_score !== null ? item.band_score.toFixed(1) : '-'}
                          </td>
                          <td className="py-3">
                            {item.passed === true ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="size-3.5" />
                                {id.history.passed}
                              </span>
                            ) : item.passed === false ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                                <XCircle className="size-3.5" />
                                {id.history.failed}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={item.result_path}>
                                <span>{id.history.view}</span>
                                <ChevronRight className="ml-1 size-3.5" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Penilaian AI Writing & Speaking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Riwayat evaluasi esai dan rekaman suara Anda dinilai otomatis oleh model AI sesuai kriteria resmi IELTS.
              </p>
              <div className="mt-4 flex gap-3">
                <Button asChild variant="outline">
                  <Link href="/peta">Latihan di Peta Belajar</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

