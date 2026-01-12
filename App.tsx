
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  getDay,
  parseISO,
  parse
} from 'date-fns';
import { ICONS, DAYS_OF_WEEK, MONTHS, SCHEDULE_COLORS } from './constants';
import { AppState, RoutineTemplate, Schedule, DiaryEntry, CheckStatus } from './types';
import { getDiaryReflection } from './services/geminiService';

const App: React.FC = () => {
  // --- State ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeTab, setActiveTab] = useState<'todo' | 'schedule' | 'diary' | 'analysis'>('todo');
  
  const [newRoutineText, setNewRoutineText] = useState("");
  const [selectedRoutineDays, setSelectedRoutineDays] = useState<number[]>([1,2,3,4,5]); 
  const [newScheduleText, setNewScheduleText] = useState("");
  const [newScheduleTime, setNewScheduleTime] = useState("");
  const [selectedColor, setSelectedColor] = useState(SCHEDULE_COLORS[0]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const icsInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<AppState>(() => {
    const saved = localStorage.getItem('modiary_data');
    const parsed = saved ? JSON.parse(saved) : { routines: [], checkStatuses: [], schedules: [], diaries: [] };
    
    if (parsed.routines) {
      parsed.routines = parsed.routines.map((r: RoutineTemplate, idx: number) => ({
        ...r,
        isActive: r.isActive !== undefined ? r.isActive : true,
        order: r.order !== undefined ? r.order : idx
      }));
    }
    return parsed;
  });

  const [aiReflection, setAiReflection] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('modiary_data', JSON.stringify(data));
  }, [data]);

  // --- Search Logic ---
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const diaryResults = data.diaries.filter(d => d.content.toLowerCase().includes(query)).map(d => ({ type: 'diary' as const, date: d.date, text: d.content }));
    const scheduleResults = data.schedules.filter(s => s.text.toLowerCase().includes(query)).map(s => ({ type: 'schedule' as const, date: s.date, text: s.text }));
    return [...diaryResults, ...scheduleResults].sort((a, b) => b.date.localeCompare(a.date));
  }, [searchQuery, data]);

  // --- ICS Parser Logic ---
  const parseICS = (text: string): Partial<Schedule>[] => {
    const events: Partial<Schedule>[] = [];
    const lines = text.split(/\r?\n/);
    let currentEvent: any = null;

    for (const line of lines) {
      if (line.startsWith('BEGIN:VEVENT')) {
        currentEvent = {};
      } else if (line.startsWith('END:VEVENT')) {
        if (currentEvent && currentEvent.date) {
          events.push(currentEvent);
        }
        currentEvent = null;
      } else if (currentEvent) {
        if (line.startsWith('SUMMARY:')) {
          currentEvent.text = line.replace('SUMMARY:', '').trim();
        } else if (line.startsWith('DTSTART')) {
          const val = line.split(':')[1];
          if (val) {
            // Format: 20231027T100000Z or 20231027
            const datePart = val.substring(0, 8);
            try {
              const parsedDate = parse(datePart, 'yyyyMMdd', new Date());
              currentEvent.date = format(parsedDate, 'yyyy-MM-dd');
              if (val.includes('T') && val.length >= 13) {
                currentEvent.time = `${val.substring(9, 11)}:${val.substring(11, 13)}`;
              } else {
                currentEvent.time = "";
              }
            } catch (e) { console.error("ICS Date Parse Error", e); }
          }
        }
      }
    }
    return events;
  };

  const handleIcsImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const importedEvents = parseICS(text);
      
      if (importedEvents.length === 0) {
        alert("가져올 수 있는 일정이 없습니다. 파일 형식을 확인해주세요.");
        return;
      }

      if (confirm(`${importedEvents.length}개의 일정을 가져오시겠습니까?`)) {
        setData(prev => {
          const newSchedules = [...prev.schedules];
          importedEvents.forEach(evt => {
            const isDuplicate = newSchedules.some(s => s.date === evt.date && s.text === evt.text);
            if (!isDuplicate) {
              newSchedules.push({
                id: crypto.randomUUID(),
                date: evt.date!,
                text: evt.text!,
                time: evt.time || "",
                color: SCHEDULE_COLORS[0].bg
              });
            }
          });
          return { ...prev, schedules: newSchedules };
        });
        alert("일정 불러오기가 완료되었습니다!");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // --- Smart Merge Logic ---
  const mergeData = (incoming: AppState) => {
    setData(prev => {
      const routineMap = new Map<string, RoutineTemplate>();
      prev.routines.forEach(r => routineMap.set(r.id, r));
      incoming.routines.forEach(r => routineMap.set(r.id, r));
      const checkMap = new Map<string, CheckStatus>();
      prev.checkStatuses.forEach(s => checkMap.set(`${s.date}_${s.templateId}`, s));
      incoming.checkStatuses.forEach(s => {
        const key = `${s.date}_${s.templateId}`;
        const existing = checkMap.get(key);
        checkMap.set(key, existing ? { ...s, completed: s.completed || existing.completed } : s);
      });
      const scheduleMap = new Map<string, Schedule>();
      prev.schedules.forEach(s => scheduleMap.set(s.id, s));
      incoming.schedules.forEach(s => scheduleMap.set(s.id, s));
      const diaryMap = new Map<string, DiaryEntry>();
      prev.diaries.forEach(d => diaryMap.set(d.date, d));
      incoming.diaries.forEach(d => {
        const existing = diaryMap.get(d.date);
        diaryMap.set(d.date, (existing && existing.content !== d.content) ? { ...d, content: `${existing.content}\n---\n${d.content}` } : d);
      });
      return { routines: Array.from(routineMap.values()), checkStatuses: Array.from(checkMap.values()), schedules: Array.from(scheduleMap.values()), diaries: Array.from(diaryMap.values()) };
    });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `modiary_backup_${format(new Date(), 'yyyyMMdd')}.json`;
    link.click(); URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        const choice = confirm("'합치기'를 하면 기존 데이터에 백업 내용을 추가합니다.\n'덮어쓰기'를 하면 기존 데이터가 지워집니다.\n\n[확인]을 누르면 '합치기', [취소]를 누르면 '덮어쓰기'를 진행합니다.");
        if (choice) { mergeData(importedData); alert("데이터가 하나로 합쳐졌습니다!"); }
        else { if (confirm("정말로 기존 데이터를 모두 지우고 덮어쓰시겠습니까?")) { setData(importedData); alert("데이터가 교체되었습니다."); } }
      } catch (err) { alert("잘못된 파일 형식입니다."); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  // --- Derived Data ---
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarDays = eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 0 }), end: endOfWeek(monthEnd, { weekStartsOn: 0 }) });

  const todayProgress = useMemo(() => {
    if (!selectedDate) return 0;
    const dayOfWeek = getDay(selectedDate);
    const todaysRoutines = data.routines.filter(r => r.isActive && r.days.includes(dayOfWeek));
    if (todaysRoutines.length === 0) return 0;
    const completedCount = todaysRoutines.filter(r => data.checkStatuses.some(s => s.templateId === r.id && s.date === selectedDateStr && s.completed)).length;
    return Math.round((completedCount / todaysRoutines.length) * 100);
  }, [data, selectedDate, selectedDateStr]);

  const routineMonthlyStats = useMemo(() => {
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return data.routines.filter(r => r.isActive).map(routine => {
      let scheduledCount = 0; let completedCount = 0;
      daysInMonth.forEach(day => {
        const dayOfWeek = getDay(day); const dateStr = format(day, 'yyyy-MM-dd');
        if (routine.days.includes(dayOfWeek)) {
          scheduledCount++; if (data.checkStatuses.some(s => s.templateId === routine.id && s.date === dateStr && s.completed)) completedCount++;
        }
      });
      return { id: routine.id, text: routine.text, completed: completedCount, total: scheduledCount, percent: scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0 };
    });
  }, [data, monthStart, monthEnd]);

  const monthlySummary = useMemo(() => {
    const totalCompleted = routineMonthlyStats.reduce((acc, s) => acc + s.completed, 0);
    const avgPercent = routineMonthlyStats.length > 0 ? Math.round(routineMonthlyStats.reduce((acc, s) => acc + s.percent, 0) / routineMonthlyStats.length) : 0;
    const bestRoutine = [...routineMonthlyStats].sort((a,b) => b.percent - a.percent)[0];
    return { totalCompleted, avgPercent, bestRoutine };
  }, [routineMonthlyStats]);

  const monthlyDiaries = useMemo(() => {
    return data.diaries.filter(d => { try { return isSameMonth(parseISO(d.date), currentDate) && d.content.trim() !== ""; } catch(e) { return false; } }).sort((a, b) => b.date.localeCompare(a.date));
  }, [data.diaries, currentDate]);

  // --- Handlers ---
  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const addRoutine = () => {
    if (!newRoutineText.trim()) return;
    const maxOrder = data.routines.reduce((max, r) => Math.max(max, r.order), -1);
    setData(prev => ({ ...prev, routines: [...prev.routines, { id: crypto.randomUUID(), text: newRoutineText.trim(), type: 'weekly', days: selectedRoutineDays, isActive: true, order: maxOrder + 1 }] }));
    setNewRoutineText("");
  };
  const deleteRoutinePermanent = (id: string) => {
    if(!confirm("이 루틴의 모든 통계 데이터가 삭제됩니다. 계속하시겠습니까?")) return;
    setData(prev => ({ ...prev, routines: prev.routines.filter(r => r.id !== id), checkStatuses: prev.checkStatuses.filter(s => s.templateId !== id) }));
  };
  const toggleCheck = (templateId: string) => {
    if (!selectedDateStr) return;
    setData(prev => {
      const existing = prev.checkStatuses.find(s => s.templateId === templateId && s.date === selectedDateStr);
      if (existing) return { ...prev, checkStatuses: prev.checkStatuses.map(s => (s.templateId === templateId && s.date === selectedDateStr) ? { ...s, completed: !s.completed } : s) };
      return { ...prev, checkStatuses: [...prev.checkStatuses, { date: selectedDateStr, templateId, completed: true }] };
    });
  };
  const addSchedule = () => {
    if (!selectedDateStr || !newScheduleText.trim()) return;
    setData(prev => ({ ...prev, schedules: [...prev.schedules, { id: crypto.randomUUID(), date: selectedDateStr, text: newScheduleText.trim(), time: newScheduleTime, color: selectedColor.bg }] }));
    setNewScheduleText(""); setNewScheduleTime("");
  };
  const removeSchedule = (id: string) => setData(prev => ({ ...prev, schedules: prev.schedules.filter(s => s.id !== id) }));
  const updateDiary = (content: string) => {
    if (!selectedDateStr) return;
    setData(prev => {
      const existingIndex = prev.diaries.findIndex(d => d.date === selectedDateStr);
      if (existingIndex > -1) {
        const newDiaries = [...prev.diaries]; newDiaries[existingIndex] = { ...newDiaries[existingIndex], content }; return { ...prev, diaries: newDiaries };
      }
      return { ...prev, diaries: [...prev.diaries, { date: selectedDateStr, content }] };
    });
  };
  const handleAiReflection = async () => {
    const diary = data.diaries.find(d => d.date === selectedDateStr); if (!diary) return;
    setIsAiLoading(true); const result = await getDiaryReflection(diary.content); setAiReflection(result); setIsAiLoading(false);
  };
  const displayRoutines = useMemo(() => {
    if (!selectedDate) return [];
    const dayOfWeek = getDay(selectedDate);
    return data.routines.filter(r => r.days.includes(dayOfWeek) && (r.isActive || data.checkStatuses.some(s => s.templateId === r.id && s.date === selectedDateStr && s.completed))).sort((a, b) => a.order - b.order);
  }, [selectedDate, data.routines, data.checkStatuses, selectedDateStr]);
  const toggleDaySelection = (day: number) => setSelectedRoutineDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  const mondayToSundayIndices = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="fixed inset-0 bg-slate-50 text-slate-900 flex items-center justify-center font-sans overflow-hidden">
      <div className="w-full h-full md:max-w-[1440px] md:h-[90vh] bg-white md:rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
        {/* Search Overlay */}
        {isSearchOpen && (
          <div className="absolute inset-0 z-[100] bg-white/95 backdrop-blur-xl animate-in fade-in duration-300 flex flex-col p-6 md:p-12">
            <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4 flex-grow"><ICONS.Search className="text-indigo-600" size={32} /><input autoFocus type="text" placeholder="검색어를 입력하세요..." className="w-full bg-transparent text-2xl md:text-4xl font-black outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
                <button onClick={() => { setIsSearchOpen(false); setSearchQuery(""); }} className="p-3 bg-slate-50 rounded-full"><ICONS.Close size={32} /></button>
              </div>
              <div className="flex-grow overflow-y-auto custom-scrollbar space-y-4">
                {searchQuery && searchResults.length === 0 ? <div className="text-center py-20 text-slate-300 font-black text-xl italic">결과가 없습니다.</div> : 
                  searchResults.map((res, idx) => (
                    <button key={idx} onClick={() => { setSelectedDate(parseISO(res.date)); setActiveTab(res.type); setIsSearchOpen(false); setSearchQuery(""); }} className="w-full text-left p-6 bg-slate-50 hover:bg-white hover:shadow-xl transition-all rounded-[32px] border-2 border-transparent hover:border-indigo-100 group">
                      <div className="flex items-center gap-3 mb-2"><span className="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-full text-xs font-black uppercase">{res.type}</span><span className="text-slate-400 font-bold">{format(parseISO(res.date), 'yyyy년 M월 d일')}</span></div>
                      <p className="text-xl font-bold text-slate-700 line-clamp-2 leading-relaxed">{res.text}</p>
                    </button>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* Left Side: Calendar */}
        <div className={`w-full md:w-[650px] flex-shrink-0 flex flex-col border-r border-slate-100 bg-slate-50/10 h-full overflow-hidden ${(selectedDate !== null || activeTab === 'analysis') ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 md:p-8 flex flex-col h-full">
            <header className="flex items-center justify-between mb-8">
              <div className="flex flex-col">
                <div className="flex items-center gap-4">
                  <button onClick={() => { setActiveTab('analysis'); setSelectedDate(null); }} className="text-2xl md:text-3xl font-black tracking-tighter text-slate-800 flex items-center gap-3">{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</button>
                  <button onClick={() => setIsSearchOpen(true)} className="p-2.5 bg-white shadow-sm border border-slate-100 rounded-full text-indigo-600 hover:scale-110 transition-transform"><ICONS.Search size={20} /></button>
                </div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] mt-1">월간 성취 리포트</span>
              </div>
              <div className="flex gap-2 bg-white p-1.5 rounded-full shadow-sm border border-slate-100">
                <button onClick={handlePrevMonth} className="p-2.5 hover:bg-slate-50 rounded-full text-slate-500"><ICONS.Prev size={20} /></button>
                <button onClick={handleNextMonth} className="p-2.5 hover:bg-slate-50 rounded-full text-slate-500"><ICONS.Next size={20} /></button>
              </div>
            </header>
            <div className="grid grid-cols-7 gap-1 mb-2">{DAYS_OF_WEEK.map(d => <div key={d} className={`text-center text-[12px] font-black uppercase tracking-widest py-2 ${d === '토' ? 'text-sky-400' : d === '일' ? 'text-rose-400' : 'text-slate-300'}`}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1.5 flex-grow overflow-y-auto custom-scrollbar content-start pb-6">
              {calendarDays.map((day, idx) => {
                const isSelected = selectedDate && isSameDay(day, selectedDate); const isToday = isSameDay(day, new Date()); const isCurrentMonth = isSameMonth(day, currentDate);
                const dateStr = format(day, 'yyyy-MM-dd'); const daySchedules = data.schedules.filter(s => s.date === dateStr);
                const hasDiary = data.diaries.some(d => d.date === dateStr && d.content.trim() !== "");
                return (
                  <button key={idx} onClick={() => { setSelectedDate(day); setActiveTab('todo'); }} className={`relative min-h-[110px] md:min-h-[135px] flex flex-col items-start p-2 rounded-2xl transition-all border-2 ${!isCurrentMonth ? 'text-slate-200 border-transparent opacity-10' : 'text-slate-600 border-white bg-white'} ${isSelected ? 'bg-indigo-600 text-white border-indigo-500 shadow-xl z-10 scale-[1.02]' : 'hover:border-indigo-100 hover:bg-indigo-50/10 shadow-sm'} ${isToday && !isSelected ? 'ring-2 ring-indigo-200 font-bold border-indigo-50' : ''}`}>
                    <div className="flex justify-between w-full items-center mb-1"><span className={`text-[12px] font-black ${isSelected ? 'text-white' : 'text-slate-800'}`}>{format(day, 'd')}</span>{hasDiary && <div className={`p-0.5 rounded-full ${isSelected ? 'bg-white text-indigo-600' : 'bg-rose-100 text-rose-500'}`}><ICONS.Diary size={10} /></div>}</div>
                    <div className="w-full space-y-1 overflow-hidden flex flex-col mt-1">{daySchedules.slice(0, 3).map(s => <div key={s.id} className={`w-full text-[9px] truncate rounded-md px-1.5 py-0.5 font-black text-left border-l-[3px] ${isSelected ? 'bg-white/20 text-white border-white/40' : `${s.color || 'bg-indigo-500'} bg-opacity-10 ${s.color?.replace('bg-', 'text-') || 'text-indigo-600'} ${s.color?.replace('bg-', 'border-') || 'border-indigo-500'}`}`}>{s.text}</div>)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Tab Content */}
        <div className={`flex-grow flex flex-col bg-white overflow-hidden ${(!selectedDate && activeTab !== 'analysis') ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex-shrink-0 z-40 bg-white shadow-sm">
            <div className="px-6 md:px-12 py-6 md:py-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => { setSelectedDate(null); setActiveTab('todo'); }} className="md:hidden p-3 bg-slate-50 text-slate-400 rounded-2xl"><ICONS.Prev size={20} /></button>
                <div>
                  <h2 className="text-2xl md:text-4xl font-black text-slate-800 tracking-tighter">{activeTab === 'analysis' ? '데이터 리포트' : format(selectedDate!, 'M월 d일')}</h2>
                  <p className="text-[11px] md:text-sm font-black text-indigo-500 uppercase tracking-[0.25em] mt-1">{activeTab === 'analysis' ? `${MONTHS[currentDate.getMonth()]} 한눈에 보기` : `${DAYS_OF_WEEK[getDay(selectedDate!)]}요일 플래너`}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedDate(null); setActiveTab('todo'); }} className="hidden md:block p-3 text-slate-300 hover:text-slate-600"><ICONS.Close size={32} /></button>
            </div>
            <div className="flex border-b border-slate-50 px-6 md:px-12 bg-white overflow-x-auto no-scrollbar">
              {(['todo', 'schedule', 'diary', 'analysis'] as const).map(tab => (
                <button key={tab} onClick={() => { setActiveTab(tab); setAiReflection(""); }} className={`flex-shrink-0 px-6 md:px-8 py-5 md:py-6 text-[11px] md:text-xs font-black transition-all relative uppercase tracking-[0.2em] ${activeTab === tab ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}>{tab === 'todo' ? '할 일' : tab === 'schedule' ? '일정' : tab === 'diary' ? '다이어리' : '분석'}{activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-indigo-600 rounded-t-3xl shadow-lg" />}</button>
              ))}
            </div>
          </div>

          <div className="flex-grow overflow-y-auto custom-scrollbar p-6 md:p-12 pb-32 md:pb-12 bg-slate-50/20">
            {activeTab === 'todo' && selectedDate && (
              <div className="max-w-3xl mx-auto space-y-10">
                <div className="bg-white p-8 md:p-10 rounded-[48px] border-2 border-indigo-50 shadow-sm flex flex-col md:flex-row items-center gap-8 animate-in slide-in-from-top-4">
                   <div className="relative w-24 h-24 flex items-center justify-center"><svg className="w-full h-full transform -rotate-90"><circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-50" /><circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * todayProgress) / 100} className="text-indigo-600 transition-all duration-1000 ease-out" /></svg><span className="absolute text-xl font-black text-slate-800">{todayProgress}%</span></div>
                   <div className="text-center md:text-left"><h4 className="text-2xl font-black text-slate-800 mb-1">오늘의 루틴 달성률</h4><p className="text-slate-400 font-bold leading-relaxed">{todayProgress === 100 ? '완벽해요! 멋진 하루를 보내셨네요.' : todayProgress >= 50 ? '절반 이상 완료! 조금만 더 힘내세요.' : '하나씩 차근차근 시작해 볼까요?'}</p></div>
                </div>
                <div className="space-y-4">
                  {displayRoutines.length === 0 ? <div className="text-center py-20 bg-white rounded-[40px] border-4 border-dashed border-slate-100 italic font-black text-slate-200">일정이 없습니다.</div> : 
                    displayRoutines.map((r) => {
                      const isDone = data.checkStatuses.some(s => s.templateId === r.id && s.date === selectedDateStr && s.completed);
                      return (
                        <div key={r.id} className={`flex items-center gap-4 p-5 md:p-7 bg-white border-2 rounded-[32px] transition-all shadow-sm ${isDone ? 'border-indigo-100 bg-indigo-50/5' : 'border-slate-50'}`}>
                          <button onClick={() => toggleCheck(r.id)} className={`scale-150 transition-all ${isDone ? 'text-indigo-600' : 'text-slate-200 hover:text-indigo-400'}`}><ICONS.Check fill={isDone ? 'currentColor' : 'transparent'} size={24} /></button>
                          <span className={`flex-grow text-xl md:text-2xl font-black ${isDone ? 'line-through text-slate-300 italic' : 'text-slate-800'}`}>{r.text}</span>
                          <button onClick={() => deleteRoutinePermanent(r.id)} className="p-3 text-slate-200 hover:text-rose-500"><ICONS.Trash size={18} /></button>
                        </div>
                      );
                    })}
                </div>
                <div className="bg-white p-8 md:p-10 rounded-[48px] border-2 border-slate-100 shadow-sm space-y-6">
                  <div className="flex gap-3"><input type="text" placeholder="새로운 루틴 입력..." className="flex-grow px-8 py-5 bg-slate-50 rounded-[28px] font-black outline-none" value={newRoutineText} onChange={(e) => setNewRoutineText(e.target.value)} /><button onClick={addRoutine} className="px-10 py-5 bg-indigo-600 text-white rounded-[28px] font-black">추가</button></div>
                  <div className="flex justify-between gap-1.5">{mondayToSundayIndices.map(dayIdx => <button key={dayIdx} onClick={() => toggleDaySelection(dayIdx)} className={`flex-1 h-12 rounded-2xl text-xs font-black border-2 transition-all ${selectedRoutineDays.includes(dayIdx) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-100'}`}>{DAYS_OF_WEEK[dayIdx]}</button>)}</div>
                </div>
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="max-w-5xl mx-auto space-y-16 animate-in fade-in duration-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-xl flex flex-col justify-between min-h-[200px]"><ICONS.Target size={32} className="opacity-50" /><div><h4 className="text-sm font-black opacity-60 uppercase tracking-widest mb-1">월간 평균 성취도</h4><p className="text-5xl font-black">{monthlySummary.avgPercent}%</p></div></div>
                  <div className="bg-white border-2 border-slate-50 p-8 rounded-[40px] shadow-sm flex flex-col justify-between min-h-[200px]"><ICONS.Check size={32} className="text-indigo-400" /><div><h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">총 완료 루틴</h4><p className="text-5xl font-black text-slate-800">{monthlySummary.totalCompleted}회</p></div></div>
                  <div className="bg-white border-2 border-slate-50 p-8 rounded-[40px] shadow-sm flex flex-col justify-between min-h-[200px]"><ICONS.Sparkles size={32} className="text-amber-400" /><div><h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">꾸준한 습관</h4><p className="text-2xl font-black text-slate-800 truncate">{monthlySummary.bestRoutine?.text || '기록 없음'}</p></div></div>
                </div>
                <div className="space-y-8">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter ml-4">루틴 성취 성적표</h3>
                  {routineMonthlyStats.map(stat => (
                    <div key={stat.id} className="bg-white border-2 border-slate-50 rounded-[40px] p-8 shadow-sm">
                      <div className="flex justify-between items-end mb-8"><div><h5 className="text-2xl font-black text-slate-800 mb-2">{stat.text}</h5><span className="text-xs font-black text-slate-400 uppercase tracking-widest">이번 달 {stat.completed}/{stat.total}회 성공</span></div><span className={`text-6xl font-black ${stat.percent >= 80 ? 'text-indigo-600' : 'text-slate-300'}`}>{stat.percent}%</span></div>
                      <div className="w-full bg-slate-50 h-6 rounded-full overflow-hidden p-1 shadow-inner"><div className="h-full rounded-full bg-indigo-600 transition-all duration-1000" style={{width: `${stat.percent}%`}} /></div>
                    </div>
                  ))}
                </div>
                <div className="space-y-8">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter ml-4">기기 연동 및 백업</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
                    <div className="bg-white border-2 border-slate-50 rounded-[40px] p-10 flex flex-col h-full">
                      <h4 className="text-xl font-black text-slate-800 mb-2">MoDiary 전용 백업</h4>
                      <p className="text-slate-400 font-medium leading-relaxed mb-6 flex-grow">다른 기기와 모든 데이터(할일, 일정, 일기)를 합치거나 복구할 때 사용합니다.</p>
                      <div className="flex gap-3">
                        <button onClick={handleExport} className="flex-1 px-4 py-4 bg-slate-900 text-white rounded-[20px] font-black text-sm flex items-center justify-center gap-2 hover:bg-black transition-all active:scale-95"><ICONS.Download size={18} /> 내보내기</button>
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 px-4 py-4 bg-indigo-600 text-white rounded-[20px] font-black text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"><ICONS.Upload size={18} /> 불러오기</button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                      </div>
                    </div>
                    <div className="bg-white border-2 border-slate-50 rounded-[40px] p-10 flex flex-col h-full">
                      <h4 className="text-xl font-black text-slate-800 mb-2">외부 캘린더 가져오기</h4>
                      <p className="text-slate-400 font-medium leading-relaxed mb-6 flex-grow">구글/애플 캘린더에서 내보낸 <b>.ics</b> 파일을 가져와 일정만 MoDiary에 추가합니다.</p>
                      <button onClick={() => icsInputRef.current?.click()} className="w-full px-4 py-4 bg-sky-500 text-white rounded-[20px] font-black text-sm flex items-center justify-center gap-2 hover:bg-sky-600 transition-all active:scale-95"><ICONS.Schedule size={18} /> .ics 파일 불러오기</button>
                      <input type="file" ref={icsInputRef} className="hidden" accept=".ics" onChange={handleIcsImport} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'schedule' && selectedDate && (
              <div className="max-w-3xl mx-auto space-y-8">
                {data.schedules.filter(s => s.date === selectedDateStr).sort((a,b) => a.time.localeCompare(b.time)).map(s => (
                  <div key={s.id} className="flex items-center gap-6 p-6 bg-white border-2 border-slate-50 rounded-[40px] shadow-sm group">
                    <div className={`min-w-[80px] py-3 rounded-2xl ${s.color || 'bg-indigo-500'} bg-opacity-10 ${s.color?.replace('bg-', 'text-') || 'text-indigo-600'} text-center`}><span className="text-xl font-black">{s.time || '종일'}</span></div>
                    <div className="flex-grow text-2xl font-black text-slate-800">{s.text}</div>
                    <button onClick={() => removeSchedule(s.id)} className="text-slate-200 group-hover:text-rose-500"><ICONS.Trash size={22} /></button>
                  </div>
                ))}
                <div className="bg-white p-8 rounded-[40px] border-2 border-slate-100 shadow-sm space-y-6">
                  <div className="grid grid-cols-2 gap-4"><input type="time" className="px-6 py-4 bg-slate-50 rounded-[20px] font-black" value={newScheduleTime} onChange={(e) => setNewScheduleTime(e.target.value)} /><input type="text" placeholder="어떤 일정이 있나요?" className="px-6 py-4 bg-slate-50 rounded-[20px] font-black" value={newScheduleText} onChange={(e) => setNewScheduleText(e.target.value)} /></div>
                  <div className="flex items-center justify-between"><div className="flex gap-2">{SCHEDULE_COLORS.map(c => <button key={c.name} onClick={() => setSelectedColor(c)} className={`w-8 h-8 rounded-full ${c.bg} ${selectedColor.name === c.name ? 'ring-4 ring-slate-800 scale-110' : 'opacity-40'}`} />)}</div><button onClick={addSchedule} className="px-10 py-4 bg-slate-900 text-white rounded-[20px] font-black">일정 등록</button></div>
                </div>
              </div>
            )}

            {activeTab === 'diary' && selectedDate && (
              <div className="max-w-4xl mx-auto space-y-8">
                <textarea placeholder="오늘의 생각을 마음껏 적어보세요..." className="w-full h-[450px] p-8 bg-white rounded-[48px] border-4 border-slate-50 text-2xl font-bold leading-relaxed resize-none outline-none focus:border-indigo-100 shadow-sm" value={data.diaries.find(d => d.date === selectedDateStr)?.content || ''} onChange={(e) => updateDiary(e.target.value)} />
                <button onClick={handleAiReflection} disabled={isAiLoading || !data.diaries.find(d => d.date === selectedDateStr)?.content} className="w-full py-6 bg-black text-white font-black text-lg rounded-[28px] tracking-[0.4em] flex items-center justify-center gap-4 active:scale-95 disabled:opacity-30"><ICONS.AI size={24} className={isAiLoading ? 'animate-spin' : ''} /> {isAiLoading ? '마음을 분석하고 있어요...' : 'AI에게 한마디 듣기'}</button>
                {aiReflection && <div className="p-10 bg-gradient-to-br from-indigo-50/50 to-white border-2 border-indigo-100 rounded-[40px] text-center text-xl font-black text-indigo-900 italic animate-in zoom-in-95">"{aiReflection}"</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
