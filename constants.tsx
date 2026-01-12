
import React from 'react';
import { 
  CheckCircle2, Calendar, BookText, Plus, Trash2, 
  ChevronLeft, ChevronRight, X, Sparkles, BarChart3, 
  Target, Archive, RotateCcw, PieChart, ChevronUp, ChevronDown, 
  GripVertical, Search, Download, Upload, FileJson
} from 'lucide-react';

export const ICONS = {
  Check: CheckCircle2,
  Schedule: Calendar,
  Diary: BookText,
  Plus: Plus,
  Trash: Trash2,
  Prev: ChevronLeft,
  Next: ChevronRight,
  Close: X,
  AI: Sparkles,
  Sparkles: Sparkles,
  Stats: BarChart3,
  Target: Target,
  Archive: Archive,
  Restore: RotateCcw,
  Analysis: PieChart,
  Up: ChevronUp,
  Down: ChevronDown,
  Grip: GripVertical,
  Search: Search,
  Download: Download,
  Upload: Upload,
  File: FileJson
};

export const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export const MONTHS = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월'
];

export const SCHEDULE_COLORS = [
  { name: 'Indigo', bg: 'bg-indigo-500', text: 'text-indigo-500', light: 'bg-indigo-50' },
  { name: 'Rose', bg: 'bg-rose-500', text: 'text-rose-500', light: 'bg-rose-50' },
  { name: 'Amber', bg: 'bg-amber-500', text: 'text-amber-500', light: 'bg-amber-50' },
  { name: 'Emerald', bg: 'bg-emerald-500', text: 'text-emerald-500', light: 'bg-emerald-50' },
  { name: 'Sky', bg: 'bg-sky-500', text: 'text-sky-500', light: 'bg-sky-50' },
  { name: 'Slate', bg: 'bg-slate-500', text: 'text-slate-500', light: 'bg-slate-50' },
];
