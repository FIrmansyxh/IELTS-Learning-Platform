'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Edit2,
  HelpCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { ContentStatus } from '@/contracts/curation';
import { id } from '@/i18n/id';
import { curationApi } from '@/lib/api/curation';
import { apiErrorMessage } from '@/lib/api/errors';
import { StatusBadge } from './curriculum-panel';

type SetListItem = {
  id: string;
  title: string;
  assessment_type: string;
  status: ContentStatus;
  tier_number: number | null;
  version: number;
  question_count: number;
  has_active_attempts: boolean;
  created_at: string;
};

type QuestionItem = {
  id: string;
  prompt: string;
  question_type: string;
  options?: Array<string | { option_id: string; text: string }>;
  correct_option_index?: number | null;
  correct_answers?: string[];
  explanation?: string | null;
  explanation_id?: string | null;
  points: number;
  order_index: number;
};

export function QualityBadge({ flag, rate, count }: { flag: string; rate?: number; count?: number }) {
  if (flag === 'TOO_HARD') {
    return (
      <Badge variant="destructive" className="text-xs gap-1" title={`${count ?? 0} peserta`}>
        <AlertCircle className="h-3 w-3" />
        Terlalu Sulit ({rate !== undefined ? `${Math.round(rate * 100)}%` : '<20%'})
      </Badge>
    );
  }
  if (flag === 'TOO_EASY') {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs gap-1" title={`${count ?? 0} peserta`}>
        <AlertTriangle className="h-3 w-3" />
        Terlalu Mudah ({rate !== undefined ? `${Math.round(rate * 100)}%` : '>98%'})
      </Badge>
    );
  }
  if (flag === 'INSUFFICIENT_DATA') {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Data Belum Cukup
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
      Normal
    </Badge>
  );
}

export function QuestionsPanel() {
  const queryClient = useQueryClient();
  const [assessmentType, setAssessmentType] = React.useState<string>('ALL');
  const [status, setStatus] = React.useState<string>('ALL');
  const [tierNumber, setTierNumber] = React.useState<string>('ALL');
  const [search, setSearch] = React.useState('');
  const [selectedSetId, setSelectedSetId] = React.useState<string | null>(null);

  // Status Change Dialog state
  const [statusDialogState, setStatusDialogState] = React.useState<{
    open: boolean;
    id: string;
    title: string;
    currentStatus: ContentStatus;
    hasActiveAttempts: boolean;
  } | null>(null);

  const [targetStatus, setTargetStatus] = React.useState<ContentStatus>('IN_REVIEW');
  const [confirmReviewed, setConfirmReviewed] = React.useState(false);
  const [statusReason, setStatusReason] = React.useState('');

  // Question Edit Sheet state
  const [editingQuestion, setEditingQuestion] = React.useState<{
    setId: string;
    question: QuestionItem;
  } | null>(null);

  const { data: setsResponse, isLoading, refetch } = useQuery({
    queryKey: ['admin-assessment-sets', assessmentType, status, tierNumber, search],
    queryFn: () =>
      curationApi.assessmentSets({
        assessment_type: assessmentType === 'ALL' ? undefined : assessmentType,
        status: status === 'ALL' ? undefined : (status as ContentStatus),
        tier_number: tierNumber === 'ALL' ? undefined : Number(tierNumber),
        q: search.trim() || undefined,
      }),
  });

  const { data: setDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['admin-assessment-set-detail', selectedSetId],
    queryFn: () => (selectedSetId ? curationApi.assessmentSet(selectedSetId) : null),
    enabled: !!selectedSetId,
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!statusDialogState) return;
      return await curationApi.changeStatus('assessment-sets', statusDialogState.id, {
        status: targetStatus,
        reason: statusReason.trim() || undefined,
        confirm_reviewed: confirmReviewed || undefined,
      });
    },
    onSuccess: () => {
      toast.success(id.adminCuration.statusSuccess);
      queryClient.invalidateQueries({ queryKey: ['admin-assessment-sets'] });
      if (selectedSetId) {
        queryClient.invalidateQueries({ queryKey: ['admin-assessment-set-detail', selectedSetId] });
      }
      setStatusDialogState(null);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
    },
  });

  const sets: SetListItem[] = setsResponse?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{id.adminCuration.questionsTitle}</h1>
          <p className="text-sm text-muted-foreground">{id.adminCuration.questionsSubtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {id.adminCuration.refresh}
        </Button>
      </div>

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">{id.adminCuration.filterType}</Label>
            <Select value={assessmentType} onValueChange={setAssessmentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{id.adminCuration.allTypes}</SelectItem>
                <SelectItem value="DRILL">Drill</SelectItem>
                <SelectItem value="MODULE_TEST">Module Test</SelectItem>
                <SelectItem value="TIER_BOSS_EXAM">Boss Stage Exam</SelectItem>
                <SelectItem value="PLACEMENT_TEST">Placement Test</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{id.adminCuration.filterStatus}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{id.adminCuration.allStatuses}</SelectItem>
                <SelectItem value="DRAFT">DRAFT</SelectItem>
                <SelectItem value="IN_REVIEW">IN_REVIEW</SelectItem>
                <SelectItem value="APPROVED">APPROVED</SelectItem>
                <SelectItem value="PUBLISHED">PUBLISHED</SelectItem>
                <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{id.adminCuration.filterTier}</Label>
            <Select value={tierNumber} onValueChange={setTierNumber}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{id.adminCuration.allTiers}</SelectItem>
                <SelectItem value="1">Tier 1</SelectItem>
                <SelectItem value="2">Tier 2</SelectItem>
                <SelectItem value="3">Tier 3</SelectItem>
                <SelectItem value="4">Tier 4</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{id.adminCuration.search}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari judul..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Sets List and Selected Set Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Sets List */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {id.adminCuration.assessmentSetsList} ({sets.length})
          </h2>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">{id.adminCuration.loading}</div>
          ) : sets.length === 0 ? (
            <div className="p-4 border rounded-md text-center text-sm text-muted-foreground">
              {id.adminCuration.noSetsFound}
            </div>
          ) : (
            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {sets.map((s) => {
                const isSelected = selectedSetId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSetId(s.id)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'hover:bg-muted/50 bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-medium text-sm line-clamp-1">{s.title}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {s.assessment_type}
                      </Badge>
                      {s.tier_number && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          T{s.tier_number}
                        </Badge>
                      )}
                      <span>v{s.version}</span>
                      <span>•</span>
                      <span>{s.question_count} soal</span>
                      {s.has_active_attempts && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0 gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Aktif
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Selected Set Detail & Questions */}
        <div className="lg:col-span-2">
          {!selectedSetId ? (
            <Card className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
              {id.adminCuration.selectSetHint}
            </Card>
          ) : isLoadingDetail ? (
            <Card className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
              {id.adminCuration.loadingDetail}
            </Card>
          ) : setDetail?.set ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{setDetail.set.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        ID: {setDetail.set.id} • Hash: {setDetail.set.content_hash?.slice(0, 12)}...
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setStatusDialogState({
                            open: true,
                            id: setDetail.set.id,
                            title: setDetail.set.title,
                            currentStatus: setDetail.set.status,
                            hasActiveAttempts: sets.find((x) => x.id === setDetail.set.id)?.has_active_attempts || false,
                          });
                          setTargetStatus(
                            setDetail.set.status === 'DRAFT'
                              ? 'IN_REVIEW'
                              : setDetail.set.status === 'IN_REVIEW'
                              ? 'APPROVED'
                              : setDetail.set.status === 'APPROVED'
                              ? 'PUBLISHED'
                              : 'DRAFT'
                          );
                          setConfirmReviewed(false);
                          setStatusReason('');
                        }}
                      >
                        {id.adminCuration.changeStatus}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-6 border-t text-xs flex flex-wrap gap-4 text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Status: </span>
                    <StatusBadge status={setDetail.set.status} />
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Tipe: </span>
                    {setDetail.set.assessment_type}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Versi: </span>
                    v{setDetail.set.version}
                  </div>
                  {setDetail.set.time_limit_sec && (
                    <div>
                      <span className="font-medium text-foreground">Batas Waktu: </span>
                      {Math.floor(setDetail.set.time_limit_sec / 60)} menit
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Questions List */}
              <Card>
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    {id.adminCuration.questionsInSet} ({setDetail.questions?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>{id.adminCuration.prompt}</TableHead>
                        <TableHead className="w-24">{id.adminCuration.type}</TableHead>
                        <TableHead className="w-16">{id.adminCuration.points}</TableHead>
                        <TableHead className="w-36">{id.adminCuration.quality}</TableHead>
                        <TableHead className="w-20 text-right">{id.adminCuration.action}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {setDetail.questions?.map((q: QuestionItem) => {
                        const qualityInfo = setDetail.quality?.[q.id];
                        return (
                          <TableRow key={q.id}>
                            <TableCell className="font-mono text-xs">{q.order_index}</TableCell>
                            <TableCell>
                              <div className="font-medium text-xs line-clamp-2">{q.prompt}</div>
                              {q.explanation && (
                                <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                  {q.explanation}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-mono">{q.question_type}</TableCell>
                            <TableCell className="text-xs">{q.points}</TableCell>
                            <TableCell>
                              <QualityBadge
                                flag={qualityInfo?.quality_flag || 'INSUFFICIENT_DATA'}
                                rate={qualityInfo?.difficulty_rate}
                                count={qualityInfo?.total_attempts}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingQuestion({ setId: setDetail.set.id, question: q })}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      {/* Change Status Dialog */}
      {statusDialogState && (
        <Dialog open={statusDialogState.open} onOpenChange={() => setStatusDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{id.adminCuration.changeStatusTitle}</DialogTitle>
              <DialogDescription>
                {statusDialogState.title} (Status saat ini: {statusDialogState.currentStatus})
              </DialogDescription>
            </DialogHeader>

            {statusDialogState.hasActiveAttempts && (
              <div className="p-3 border border-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded-md text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong>{id.adminCuration.activeAttemptsWarningTitle}</strong>
                  <p>{id.adminCuration.activeAttemptsWarningDesc}</p>
                </div>
              </div>
            )}

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{id.adminCuration.targetStatus}</Label>
                <Select
                  value={targetStatus}
                  onValueChange={(val) => setTargetStatus(val as ContentStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">DRAFT</SelectItem>
                    <SelectItem value="IN_REVIEW">IN_REVIEW</SelectItem>
                    <SelectItem value="APPROVED">APPROVED</SelectItem>
                    <SelectItem value="PUBLISHED">PUBLISHED</SelectItem>
                    <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(targetStatus === 'IN_REVIEW' ||
                targetStatus === 'APPROVED' ||
                targetStatus === 'PUBLISHED') && (
                <div className="flex items-start space-x-2 border p-3 rounded-md bg-purple-50/50 dark:bg-purple-950/20 border-purple-200">
                  <Checkbox
                    id="set-confirm-reviewed"
                    checked={confirmReviewed}
                    onCheckedChange={(c) => setConfirmReviewed(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="set-confirm-reviewed" className="cursor-pointer text-xs font-medium">
                      {id.adminCuration.confirmReviewedLabel}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {id.adminCuration.confirmReviewedDesc}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>{id.adminCuration.reasonOptional}</Label>
                <Input
                  placeholder={id.adminCuration.reasonPlaceholder}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusDialogState(null)}>
                {id.adminCuration.cancel}
              </Button>
              <Button
                onClick={() => statusMutation.mutate()}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? id.adminCuration.saving : id.adminCuration.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Question Sheet */}
      {editingQuestion && (
        <QuestionEditSheet
          setId={editingQuestion.setId}
          question={editingQuestion.question}
          onClose={() => setEditingQuestion(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ['admin-assessment-set-detail', editingQuestion.setId],
            });
            queryClient.invalidateQueries({ queryKey: ['admin-assessment-sets'] });
          }}
        />
      )}
    </div>
  );
}

function QuestionEditSheet({
  setId,
  question,
  onClose,
  onSuccess,
}: {
  setId: string;
  question: QuestionItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [prompt, setPrompt] = React.useState(question.prompt || '');
  const [explanation, setExplanation] = React.useState(question.explanation || '');
  const [points, setPoints] = React.useState(question.points ?? 1);
  const [orderIndex, setOrderIndex] = React.useState(question.order_index ?? 1);
  const [correctOptionIndex, setCorrectOptionIndex] = React.useState<number | null>(
    question.correct_option_index ?? 0
  );
  const [options, setOptions] = React.useState<string[]>(
    Array.isArray(question.options)
      ? question.options.map((o) => (typeof o === 'string' ? o : o.text))
      : []
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const formattedOptions =
        options.length > 0
          ? options.map((opt, idx) => ({
              option_id: `opt_${idx + 1}`,
              text: opt,
            }))
          : undefined;

      const correctAnswers =
        correctOptionIndex !== null && formattedOptions
          ? [formattedOptions[correctOptionIndex]?.option_id].filter(Boolean) as string[]
          : undefined;

      return await curationApi.updateQuestion(setId, question.id, {
        prompt: prompt.trim(),
        explanation_id: explanation.trim() || undefined,
        points,
        options: formattedOptions,
        correct_answers: correctAnswers,
      });
    },
    onSuccess: () => {
      toast.success(id.adminCuration.editQuestionSuccess);
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
    },
  });

  const handleOptionChange = (idx: number, val: string) => {
    setOptions((prev) => {
      const copy = [...prev];
      copy[idx] = val;
      return copy;
    });
  };

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{id.adminCuration.editQuestionTitle}</SheetTitle>
          <SheetDescription>
            {id.adminCuration.editQuestionDesc} (ID: {question.id})
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{id.adminCuration.prompt}</Label>
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Teks soal..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{id.adminCuration.orderIndex}</Label>
              <Input
                type="number"
                value={orderIndex}
                onChange={(e) => setOrderIndex(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>{id.adminCuration.points}</Label>
              <Input
                type="number"
                min={1}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Multiple choice options editor */}
          {options.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold">{id.adminCuration.optionsAndAnswer}</Label>
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={correctOptionIndex === idx}
                      onChange={() => setCorrectOptionIndex(idx)}
                      className="cursor-pointer"
                      title="Tandai sebagai jawaban benar"
                    />
                    <span className="font-mono text-xs w-6">{String.fromCharCode(65 + idx)}.</span>
                    <Input
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Pilihan ${String.fromCharCode(65 + idx)}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <Label>{id.adminCuration.explanation}</Label>
            <Textarea
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Penjelasan jawaban..."
            />
          </div>
        </div>

        <SheetFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            {id.adminCuration.cancel}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !prompt.trim()}>
            {saveMutation.isPending ? id.adminCuration.saving : id.adminCuration.saveChanges}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
