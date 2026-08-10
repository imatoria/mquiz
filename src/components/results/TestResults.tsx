import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dbService } from '@/services/db';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ViolationReporting } from './ViolationReporting';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { recheckQuestionWithAI, generateExplanationWithAI } from '@/services/ai/aiService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  Eye,
  EyeOff,
  Award,
  ShieldAlert,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  BookOpen
} from 'lucide-react';

interface TestAttempt {
  id: string;
  score: number;
  total_questions: number;
  completed_at: string;
  answers: Record<string, string>;
  show_results: boolean;
  question_papers?: {
    id: string;
    title: string;
    subjects?: { subject_name: string };
  };
}

interface QuestionResult {
  question_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  user_answer: string;
  is_correct: boolean;
}

export const TestResults = () => {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<TestAttempt | null>(null);
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  // Selection & Action States for Recheck and Explanation
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [recheckResults, setRecheckResults] = useState<Record<string, { status: 'verified' | 'flagged'; reason: string }>>({});
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set());

  const [isRechecking, setIsRechecking] = useState(false);
  const [isGeneratingExplanation, setIsGeneratingExplanation] = useState(false);
  const [showRecheckModal, setShowRecheckModal] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadTestResults();
    }
  }, [user?.id]);

  useEffect(() => {
    const state = location.state as { openAttemptId?: string };
    if (state?.openAttemptId && attempts.length > 0 && !showBreakdown) {
      const attemptToOpen = attempts.find(a => a.id === state.openAttemptId);
      if (attemptToOpen && attemptToOpen.show_results) {
        setSelectedAttempt(attemptToOpen);
        setShowBreakdown(true);
        loadQuestionBreakdown(attemptToOpen.id, attemptToOpen.answers);
        
        // Clear the state so it doesn't reopen if the user navigates back
        window.history.replaceState({}, document.title);
      }
    }
  }, [attempts, location.state]);

  const loadTestResults = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data: attemptsData, error } = await dbService.getProvider().query(
        'SELECT * FROM paper_attempts WHERE user_id = ?',
        [user.id]
      );

      if (error) throw error;

      const { data: papersData } = await dbService.getProvider().query('SELECT * FROM question_papers');
      const { data: subjectsData } = await dbService.getProvider().query('SELECT * FROM subjects');

      const paperMap = new Map((papersData || []).map((p: any) => [p.id, p]));
      const subjMap = new Map((subjectsData || []).map((s: any) => [s.id, s.subject_name]));

      const formattedAttempts: TestAttempt[] = (attemptsData || []).map((attempt: any) => {
        const paper = paperMap.get(attempt.paper_id);
        const subjName = paper ? (subjMap.get(paper.subject_id) || 'General') : 'General';
        
        let parsedAnswers = attempt.answers || {};
        if (typeof attempt.answers === 'string') {
          try {
            parsedAnswers = JSON.parse(attempt.answers);
          } catch {
            parsedAnswers = {};
          }
        }

        return {
          id: attempt.id,
          score: attempt.score || 0,
          total_questions: attempt.total_questions || 0,
          completed_at: attempt.completed_at || attempt.started_at || new Date().toISOString(),
          answers: parsedAnswers,
          show_results: attempt.show_results ?? true,
          question_papers: {
            id: paper?.id || attempt.paper_id,
            title: paper?.title || 'Question Paper',
            subjects: {
              subject_name: subjName
            }
          }
        };
      });

      setAttempts(formattedAttempts);
    } catch (error) {
      console.error('Error loading test results:', error);
      toast({
        title: "Error",
        description: "Failed to load test results",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionBreakdown = async (attemptId: string, answers: Record<string, string>) => {
    try {
      const attempt = attempts.find(a => a.id === attemptId);
      if (!attempt) {
        toast({
          title: "Error",
          description: "Test attempt not found",
          variant: "destructive"
        });
        return;
      }

      const questionPaperId = attempt.question_papers?.id;
      
      if (!questionPaperId) {
        toast({
          title: "Error",
          description: "Question paper not found for this test",
          variant: "destructive"
        });
        return;
      }

      const { data: qpqData } = await dbService.getProvider().query(
        'SELECT * FROM question_paper_questions WHERE question_paper_id = ?',
        [questionPaperId]
      );

      const { data: allQuestions } = await dbService.getProvider().query('SELECT * FROM questions');
      const questionMap = new Map((allQuestions || []).map((q: any) => [q.id, q]));

      let parsedAnswers = answers;
      if (typeof answers === 'string') {
        try {
          parsedAnswers = JSON.parse(answers);
        } catch (e) {
          console.warn('Failed to parse answers as JSON, using as-is');
        }
      }

      const userAnswersObj = (parsedAnswers as any)?.userAnswers || parsedAnswers || {};

      const results: QuestionResult[] = (qpqData || []).map((item: any) => {
        const question = questionMap.get(item.question_id) || {};
        const userAnswer = userAnswersObj[question.id] || '';
        
        let opts: any[] = [];
        try {
          opts = typeof question.options === 'string' ? JSON.parse(question.options || '[]') : (question.options || []);
        } catch {
          opts = [];
        }

        const optionA = question.option_a || opts[0] || '';
        const optionB = question.option_b || opts[1] || '';
        const optionC = question.option_c || opts[2] || '';
        const optionD = question.option_d || opts[3] || '';
        const correctAnswer = (question.correct_answer || 'a').toLowerCase();
        const isCorrect = userAnswer && userAnswer.toLowerCase() === correctAnswer;

        return {
          question_id: question.id || item.question_id,
          question_text: question.question_text || 'Question Text',
          option_a: optionA,
          option_b: optionB,
          option_c: optionC,
          option_d: optionD,
          correct_answer: correctAnswer,
          user_answer: userAnswer || '',
          is_correct: isCorrect
        };
      });

      setQuestionResults(results);
      setSelectedQuestionIds(new Set());
      setRecheckResults({});
      setExplanations({});
      setShowBreakdown(true);
    } catch (error) {
      console.error('Error loading question breakdown:', error);
      toast({
        title: "Error",
        description: "Failed to load question details",
        variant: "destructive"
      });
    }
  };

  const isAllSelected = questionResults.length > 0 && selectedQuestionIds.size === questionResults.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedQuestionIds(new Set());
    } else {
      setSelectedQuestionIds(new Set(questionResults.map(q => q.question_id)));
    }
  };

  const handleToggleSelectQuestion = (qId: string) => {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
      } else {
        next.add(qId);
      }
      return next;
    });
  };

  const handleRecheckSelected = async () => {
    if (selectedQuestionIds.size === 0) return;
    setIsRechecking(true);

    try {
      const newRecheckResults: Record<string, { status: 'verified' | 'flagged'; reason: string; isChanged: boolean }> = { ...recheckResults };
      let updateCount = 0;
      let changedCount = 0;

      for (const q of questionResults) {
        if (selectedQuestionIds.has(q.question_id)) {
          // Send ONLY Question Text & Options Text to AI without revealing correct_answer to eliminate bias
          const aiResult = await recheckQuestionWithAI(
            q.question_text,
            {
              option_a: q.option_a,
              option_b: q.option_b,
              option_c: q.option_c,
              option_d: q.option_d
            }
          );

          const aiOption = aiResult.correct_option.toLowerCase();
          const existingOption = (q.correct_answer || '').toLowerCase();
          const isChanged = aiOption !== existingOption;

          // If AI determined a new/different answer, update database
          if (isChanged) {
            await dbService.getProvider().execute(
              'UPDATE questions SET correct_answer = ? WHERE id = ?',
              [aiOption, q.question_id]
            );
            q.correct_answer = aiOption;
            changedCount++;
          }

          newRecheckResults[q.question_id] = {
            status: 'verified',
            reason: `AI Verified: Option ${aiOption.toUpperCase()} (${aiResult.reasoning})`,
            isChanged: true
          };
          updateCount++;
        }
      }

      setRecheckResults(newRecheckResults);

      toast({
        title: "AI Re-check Completed",
        description: `AI rechecked ${updateCount} question(s). ${changedCount > 0 ? `Updated ${changedCount} answer key(s) in DB.` : 'All answer keys verified.'}`,
      });
    } catch (error: any) {
      console.error('AI Recheck error:', error);
      toast({
        title: "Recheck Failed",
        description: error?.message || "An error occurred while rechecking questions with AI.",
        variant: "destructive"
      });
    } finally {
      setIsRechecking(false);
    }
  };

  const handleGenerateExplanations = async () => {
    if (selectedQuestionIds.size === 0) return;
    setIsGeneratingExplanation(true);

    try {
      const newExplanations: Record<string, string> = { ...explanations };

      for (const q of questionResults) {
        if (selectedQuestionIds.has(q.question_id)) {
          // Request AI explanation with step-by-step reasoning & shortcut trick
          const aiResult = await generateExplanationWithAI(
            q.question_text,
            {
              option_a: q.option_a,
              option_b: q.option_b,
              option_c: q.option_c,
              option_d: q.option_d
            },
            q.correct_answer
          );

          newExplanations[q.question_id] = aiResult.explanation;
        }
      }

      setExplanations(newExplanations);

      toast({
        title: "AI Explanations Generated",
        description: `Generated step-by-step reasoning and shortcut tricks for ${selectedQuestionIds.size} selected question(s).`,
      });
    } catch (error: any) {
      console.error('Explanation error:', error);
      toast({
        title: "Explanation Failed",
        description: error?.message || "An error occurred while generating AI explanations.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingExplanation(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getGrade = (score: number) => {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'C+';
    if (score >= 65) return 'C';
    if (score >= 60) return 'D+';
    if (score >= 55) return 'D';
    return 'F';
  };

  const calculateAverage = () => {
    const approvedAttempts = attempts.filter(attempt => attempt.show_results);
    if (approvedAttempts.length === 0) return 0;
    return Math.round(approvedAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / approvedAttempts.length);
  };

  const getPerformanceTrend = () => {
    const approvedAttempts = attempts.filter(attempt => attempt.show_results);
    if (approvedAttempts.length < 2) return null;
    const recent = approvedAttempts.slice(0, 3).reverse();
    const older = approvedAttempts.slice(3, 6).reverse();
    
    if (older.length === 0) return null;
    
    const recentAvg = recent.reduce((sum, a) => sum + a.score, 0) / recent.length;
    const olderAvg = older.reduce((sum, a) => sum + a.score, 0) / older.length;
    
    return recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'declining' : 'stable';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {attempts.filter(a => a.show_results).length > 0 ? `${calculateAverage()}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {attempts.filter(a => a.show_results).length > 0 ? `Grade: ${getGrade(calculateAverage())}` : 'No approved results'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tests Completed</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attempts.length}</div>
            <p className="text-xs text-muted-foreground">
              Total attempts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance Trend</CardTitle>
            {getPerformanceTrend() === 'improving' ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : getPerformanceTrend() === 'declining' ? (
              <TrendingDown className="h-4 w-4 text-red-600" />
            ) : (
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {getPerformanceTrend() || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Recent performance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{showBreakdown ? 'Test Results Breakdown' : 'Test Results'}</span>
            {showBreakdown && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setShowBreakdown(false);
                  setSelectedAttempt(null);
                }}
              >
                ← Back to Results
              </Button>
            )}
          </CardTitle>
          {!showBreakdown && (
            <CardDescription>
              View your test performance and detailed breakdowns
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!showBreakdown ? (
            // Results List
            <div className="space-y-4">
              {attempts.map((attempt, index) => (
                <Card key={`${attempt.id || 'att'}-${index}`} className={`${attempt.show_results ? 'cursor-pointer hover:bg-muted/50' : ''} transition-colors`}
                      onClick={() => {
                        if (attempt.show_results) {
                          setSelectedAttempt(attempt);
                          loadQuestionBreakdown(attempt.id, attempt.answers);
                        }
                      }}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-semibold">{attempt.question_papers?.title || 'Question Paper'}</h4>
                        <p className="text-sm text-muted-foreground">
                          {attempt.question_papers?.subjects?.subject_name || 'General'}
                        </p>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(attempt.completed_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right space-y-2">
                        {attempt.show_results ? (
                          <>
                            <div className={`text-2xl font-bold ${getScoreColor(attempt.score)}`}>
                              {attempt.score}%
                            </div>
                            <Badge variant={attempt.score >= 70 ? "default" : "destructive"}>
                              {getGrade(attempt.score)}
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              {Math.round((attempt.score / 100) * attempt.total_questions)}/{attempt.total_questions} correct
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center text-muted-foreground">
                              <EyeOff className="w-4 h-4 mr-1" />
                              <span className="text-sm">Pending Approval</span>
                            </div>
                            <Badge variant="secondary">
                              Results Pending
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              {attempt.total_questions} questions
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <Progress 
                      value={attempt.show_results ? attempt.score : 0} 
                      className="mt-4 h-2"
                    />
                  </CardContent>
                </Card>
              ))}

              {attempts.length === 0 && (
                <div className="text-center py-8">
                  <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Test Results</h3>
                  <p className="text-muted-foreground">
                    Complete a test to see your results here.
                  </p>
                </div>
              )}
            </div>
          ) : (
            // Breakdown with Tabs
            selectedAttempt && (
              <Tabs defaultValue="breakdown" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="breakdown">Test Breakdown</TabsTrigger>
                  <TabsTrigger value="violations">
                    <ShieldAlert className="h-4 w-4 mr-2" />
                    Security Violations
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="breakdown" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">{selectedAttempt.question_papers?.title || 'Question Paper'}</h3>
                      <p className="text-sm text-muted-foreground">
                        Score: <span className="font-semibold text-foreground">{selectedAttempt.score}%</span> ({Math.round((selectedAttempt.score / 100) * selectedAttempt.total_questions)}/{selectedAttempt.total_questions} correct)
                      </p>
                    </div>

                    {/* Top Action Bar for Recheck and Explanation */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {selectedQuestionIds.size} of {questionResults.length} Selected
                        </Badge>
                        <div className="flex items-center gap-2 border-l pl-3">
                          <Switch
                            id="toggle-options-student"
                            checked={showOptions}
                            onCheckedChange={setShowOptions}
                          />
                          <Label htmlFor="toggle-options-student" className="text-xs cursor-pointer select-none font-medium text-muted-foreground">
                            Show Choices
                          </Label>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRecheckSelected}
                          disabled={selectedQuestionIds.size === 0 || isRechecking}
                          className="h-8 text-xs gap-1.5"
                        >
                          {isRechecking ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5 text-primary" />
                          )}
                          Recheck Answer {selectedQuestionIds.size > 0 && `(${selectedQuestionIds.size})`}
                        </Button>
                        
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleGenerateExplanations}
                          disabled={selectedQuestionIds.size === 0 || isGeneratingExplanation}
                          className="h-8 text-xs gap-1.5 bg-quiz hover:bg-quiz/90"
                        >
                          {isGeneratingExplanation ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                          )}
                          Explanation {selectedQuestionIds.size > 0 && `(${selectedQuestionIds.size})`}
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="w-10 text-center">
                              <Checkbox
                                checked={isAllSelected}
                                onCheckedChange={handleToggleSelectAll}
                                aria-label="Select all questions"
                              />
                            </TableHead>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Question</TableHead>
                            <TableHead className="whitespace-nowrap w-28">Your Answer</TableHead>
                            {selectedAttempt?.show_results && (
                              <TableHead className="whitespace-nowrap w-28">Correct Answer</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {questionResults.map((result, index) => {
                            const isRecheckUpdated = Boolean(recheckResults[result.question_id]?.isChanged);
                            const correctLetter = (result.correct_answer || 'a').toLowerCase();

                            return (
                              <TableRow key={`${result.question_id || 'q'}-${index}`}>
                                <TableCell className="text-center align-top pt-4">
                                  <Checkbox
                                    checked={selectedQuestionIds.has(result.question_id)}
                                    onCheckedChange={() => handleToggleSelectQuestion(result.question_id)}
                                    aria-label={`Select question ${index + 1}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium align-top pt-4">{index + 1}</TableCell>
                                <TableCell className="max-w-md align-top pt-4">
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium">{result.question_text}</p>
                                    
                                    {showOptions && (
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className={cn(
                                          "p-1.5 rounded border transition-colors",
                                          correctLetter === 'a' && isRecheckUpdated 
                                            ? "bg-green-100 dark:bg-green-950/60 border-green-400 text-green-800 dark:text-green-200 font-medium" 
                                            : "text-muted-foreground bg-muted/20"
                                        )}>
                                          A. {result.option_a}
                                        </div>
                                        <div className={cn(
                                          "p-1.5 rounded border transition-colors",
                                          correctLetter === 'b' && isRecheckUpdated 
                                            ? "bg-green-100 dark:bg-green-950/60 border-green-400 text-green-800 dark:text-green-200 font-medium" 
                                            : "text-muted-foreground bg-muted/20"
                                        )}>
                                          B. {result.option_b}
                                        </div>
                                        <div className={cn(
                                          "p-1.5 rounded border transition-colors",
                                          correctLetter === 'c' && isRecheckUpdated 
                                            ? "bg-green-100 dark:bg-green-950/60 border-green-400 text-green-800 dark:text-green-200 font-medium" 
                                            : "text-muted-foreground bg-muted/20"
                                        )}>
                                          C. {result.option_c}
                                        </div>
                                        <div className={cn(
                                          "p-1.5 rounded border transition-colors",
                                          correctLetter === 'd' && isRecheckUpdated 
                                            ? "bg-green-100 dark:bg-green-950/60 border-green-400 text-green-800 dark:text-green-200 font-medium" 
                                            : "text-muted-foreground bg-muted/20"
                                        )}>
                                          D. {result.option_d}
                                        </div>
                                      </div>
                                    )}

                                    {/* Explanation rendered directly below the options/choices */}
                                    {explanations[result.question_id] && (
                                      <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-foreground whitespace-pre-line leading-relaxed font-sans">
                                        <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400 mb-1">
                                          <Sparkles className="w-3.5 h-3.5" />
                                          Explanation
                                        </div>
                                        {explanations[result.question_id]}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="align-top pt-4">
                                  <Badge variant={(selectedAttempt?.show_results && result.user_answer) ? (result.is_correct ? "default" : "destructive") : "secondary"} className="whitespace-nowrap">
                                    {result.user_answer ? result.user_answer.toUpperCase() : 'No Answer'}
                                  </Badge>
                                </TableCell>
                                {selectedAttempt?.show_results && (
                                  <TableCell className="align-top pt-4">
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        "whitespace-nowrap font-mono",
                                        isRecheckUpdated && "bg-green-100 text-green-800 border-green-400 font-bold dark:bg-green-950/60 dark:text-green-200"
                                      )}
                                    >
                                      {result.correct_answer.toUpperCase()}
                                      {isRecheckUpdated && " ✓"}
                                    </Badge>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="violations" className="mt-4">
                  <ViolationReporting attemptId={selectedAttempt.id} />
                </TabsContent>
              </Tabs>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
};