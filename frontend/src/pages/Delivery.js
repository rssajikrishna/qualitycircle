import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams as useRParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { ChevronLeft, ChevronRight, Star, Activity, Clock, Calendar, TrendingUp, Trash2, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid, YAxis, Legend, Tooltip } from 'recharts';
import CircularTracker from '../components/CircularTracker';
import { dashboardMetrics as initialData } from '../dashboardData';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/metrics`;
const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DEPT_FULL = { fg: 'Finished Good Warehouse', pm: 'Packing Material Warehouse', rm: 'Raw Material Warehouse', qcmad: 'QC & Microbiology & AD Lab', pro: 'Production', pop: 'Post Production', ppp: 'Primary Packing Production', spp: 'Secondary Packing Production', fac: 'Facilities' };

// Department-specific Delivery metric labels per GMP document
// delay*Type: 'time' = red if >0, unit=min | 'zero' = red if >0, unit=count/batches | 'pct' = red if <100, unit=%
const DEPT_DELIVERY_LABELS = {
  fg: {
    planVsActual: 'Plan vs Actual Disposed',
    archiveTitle: 'Disposal Archives',
    targetLabel: 'Target Disposed', actualLabel: 'Actual Disposed',
    delay1Col: 'BPR Receipts', delay1Ph: 'Delayed BPR Receipts (min)',
    delay1Unit: 'min', delay1Type: 'time',
    delay2Col: 'Shipments', delay2Ph: 'Delayed Shipments / Logistics (min)',
    delay2Unit: 'min', delay2Type: 'time',
  },
  pm: {
    planVsActual: 'Plan vs Actual Dispensed',
    archiveTitle: 'Dispatch Archives',
    targetLabel: 'Target Dispensed', actualLabel: 'Actual Dispensed',
    delay1Col: 'PBR/Indent', delay1Ph: 'Delayed PBR / Indent (min)',
    delay1Unit: 'min', delay1Type: 'time',
    delay2Col: 'PM QC Approval', delay2Ph: 'Delayed PM QC Approval (min)',
    delay2Unit: 'min', delay2Type: 'time',
  },
  rm: {
    planVsActual: 'Plan vs Actual Dispensed',
    archiveTitle: 'Dispatch Archives',
    targetLabel: 'Target Dispensed', actualLabel: 'Actual Dispensed',
    delay1Col: 'BMR/Indent', delay1Ph: 'Delayed BMR / Indent (min)',
    delay1Unit: 'min', delay1Type: 'time',
    delay2Col: 'RM QC Approval', delay2Ph: 'Delayed RM QC Approval (min)',
    delay2Unit: 'min', delay2Type: 'time',
  },
  qcmad: {
    planVsActual: 'Plan vs Actual Tasks',
    archiveTitle: 'Task Archives',
    targetLabel: 'Tasks Planned', actualLabel: 'Tasks Executed',
    delay1Col: 'Sample Testing', delay1Ph: 'Delayed Sample Testing (min)',
    delay1Unit: 'min', delay1Type: 'time',
    delay2Col: 'Repeated Testing', delay2Ph: 'No. of Invalid / Repeated Testing',
    delay2Unit: '', delay2Type: 'zero',
  },
  pro: {
    planVsActual: 'Plan vs Actual Manufactured',
    archiveTitle: 'Production Archives',
    targetLabel: 'Target Output', actualLabel: 'Actual Output',
    delay1Col: 'RM Shortage', delay1Ph: 'Raw Material Shortage Impact (batches)',
    delay1Unit: '', delay1Type: 'zero',
    delay2Col: 'Changeover', delay2Ph: 'Non-Serial Changeover Time (min)',
    delay2Unit: 'min', delay2Type: 'time',
  },
  pop: {
    planVsActual: 'Plan vs Actual Manufactured',
    archiveTitle: 'Production Archives',
    targetLabel: 'Target Output', actualLabel: 'Actual Output',
    delay1Col: 'RM Shortage', delay1Ph: 'Raw Material Shortage Impact (batches)',
    delay1Unit: '', delay1Type: 'zero',
    delay2Col: 'Changeover', delay2Ph: 'Non-Serial Changeover Time (min)',
    delay2Unit: 'min', delay2Type: 'time',
  },
  ppp: {
    planVsActual: 'Plan vs Actual Packed',
    archiveTitle: 'Packing Archives',
    targetLabel: 'Target Packed', actualLabel: 'Actual Packed',
    delay1Col: 'RM Shortage', delay1Ph: 'Raw Material Shortage Impact (batches)',
    delay1Unit: '', delay1Type: 'zero',
    delay2Col: 'Changeover', delay2Ph: 'Non-Serial Changeover Time (min)',
    delay2Unit: 'min', delay2Type: 'time',
  },
  spp: {
    planVsActual: 'Plan vs Actual Packed',
    archiveTitle: 'Packing Archives',
    targetLabel: 'Target Packed', actualLabel: 'Actual Packed',
    delay1Col: 'Label Errors', delay1Ph: 'No. of Labeling / Serialization Errors',
    delay1Unit: '', delay1Type: 'zero',
    delay2Col: 'Pkg Shortage', delay2Ph: 'No. of Carton / Packaging Material Shortage (batches)',
    delay2Unit: '', delay2Type: 'zero',
  },
  fac: {
    planVsActual: 'Plan vs Actual Tasks',
    archiveTitle: 'Task Archives',
    targetLabel: 'Tasks Planned', actualLabel: 'Tasks Completed',
    delay1Col: 'Housekeeping', delay1Ph: 'GMP & Non-GMP Housekeeping Compliance (%)',
    delay1Unit: '%', delay1Type: 'pct',
    delay2Col: 'Waste Removal', delay2Ph: 'Timeliness of Waste Removal (%)',
    delay2Unit: '%', delay2Type: 'pct',
  },
};

const THEME_STYLES = {
  emerald: { bg: 'bg-emerald-600', text: 'text-emerald-800', light: 'bg-emerald-50/20', border: 'border-emerald-100' },
  blue: { bg: 'bg-blue-600', text: 'text-blue-800', light: 'bg-blue-50/20', border: 'border-blue-100' }
};

const DeliveryPage = () => {
  const navigate = useNavigate();
  const { shift: paramShift, dept: paramDept } = useRParams();
  const user = JSON.parse(localStorage.getItem('userInfo') || 'null');
  const isSuperAdmin = user?.role === 'superadmin';
  const isSupervisor = user?.role === 'supervisor';
  const reportRef = useRef(null);

  const activeShift = paramShift || user?.shift || '1';
  const activeDept = paramDept || 'fg';

  const userDepts = (user?.department || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAssignedDept = isSuperAdmin || userDepts.includes(activeDept.toLowerCase());
  const canEdit = (isSupervisor && isAssignedDept) || isSuperAdmin;
  const deptLabels = DEPT_DELIVERY_LABELS[activeDept] || DEPT_DELIVERY_LABELS.fg;

  // --- State ---
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeLock, setTimeLock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(initialData);
  const [lastBackupTime, setLastBackupTime] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());

  // New State for Custom Alert
  const [deleteConfig, setDeleteConfig] = useState({ isOpen: false, type: null, index: null, rawDate: null });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [tableSyncing, setTableSyncing] = useState({ staff: false, activity: false });

  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [plannedCount, setPlannedCount] = useState('');
  const [dispatchedCount, setDispatchedCount] = useState('');
  const [breakdowns, setBreakdowns] = useState('');
  const [pbrDelay, setPbrDelay] = useState('');
  const [qcDelay, setQcDelay] = useState('');

  const [staffLogs, setStaffLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  const viewMonth = viewDate.getMonth();
  const viewYear = viewDate.getFullYear();

  // --- Memos ---
  const dData = useMemo(() => {
    const found = metrics.find(m => m.letter === 'D') || metrics[1];
    return { ...found, issueLogs: Array.isArray(found.issueLogs) ? found.issueLogs : [] };
  }, [metrics]);

  const allYearLogs = useMemo(() => {
    return MONTHS.map((monthName, index) => {
      const logs = dData.issueLogs
        .filter(l => {
          const d = new Date(l.rawDate);
          return d.getMonth() === index && d.getFullYear() === viewYear;
        })
        .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
      return { monthName, monthIndex: index, logs };
    });
  }, [dData.issueLogs, viewYear]);

  // --- Improved Deletion Logic (Async Cloud Sync) ---
  const handleDeleteLog = async () => {
    const { type, index, rawDate } = deleteConfig;
    
    try {
      if (type === 'staff' || type === 'activity') {
        const setter = type === 'staff' ? setStaffLogs : setActivityLogs;
        const currentLogs = type === 'staff' ? staffLogs : activityLogs;
        const updatedLogs = currentLogs.filter((_, i) => i !== index);

        const res = await fetch(`${API_BASE}/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            letter: 'D', shift: activeShift, dept: activeDept, 
            logs: updatedLogs 
          }),
        });
        if (res.ok) setter(updatedLogs);
      } 
      else if (type === 'dispatch' || type === 'minor') {
        const updatedIssueLogs = dData.issueLogs.filter(l => l.rawDate !== rawDate);
        const res = await fetch(`${API_BASE}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...dData, shift: activeShift, dept: activeDept, issueLogs: updatedIssueLogs }),
        });
        if (res.ok) {
          const saved = await res.json();
          setMetrics(prev => prev.map(m => m.letter === 'D' ? saved : m));
        }
      }
      setLastBackupTime(new Date());
      setDeleteConfig({ isOpen: false, type: null, index: null, rawDate: null });
    } catch (e) {
      alert("Delete operation failed.");
    }
  };

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}?shift=${activeShift}&dept=${activeDept}`);
      const dbData = await res.json();
      if (dbData && Array.isArray(dbData)) {
        setMetrics(initialData.map(b => dbData.find(d => d.letter === b.letter) || b));
        const dLive = dbData.find(d => d.letter === 'D');
        setStaffLogs(dLive?.staffLogs || []);
        setActivityLogs(dLive?.activityLogs || []);
      }
    } catch (e) { console.error("Fetch error:", e); } finally { setLoading(false); }
  };

  const handleLogSubmit = async (type) => {
    setTableSyncing(prev => ({ ...prev, [type]: true }));
    try {
      const res = await fetch(`${API_BASE}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letter: 'D', shift: activeShift, dept: activeDept,
          logs: type === 'staff' ? staffLogs : activityLogs,
          empId: user?.employeeId, empName: user?.name,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setMetrics(prev => prev.map(m => m.letter === 'D' ? { ...m, ...result } : m));
        type === 'staff' ? setIsStaffModalOpen(false) : setIsActivityModalOpen(false);
        setLastBackupTime(new Date());
      }
    } catch (e) { alert("Sync failed"); } finally { setTableSyncing(prev => ({ ...prev, [type]: false })); }
  };

  const handleUpdateStatus = async () => {
    if (!plannedCount || !dispatchedCount) return alert("Please enter counts");
    const [y, m, d] = customDate.split('-');
    const newEntry = {
      date: `${d}/${m}/${y}`, 
      rawDate: customDate,
      planned: Number(plannedCount), 
      dispatched: Number(dispatchedCount),
      breakdowns: Number(breakdowns || 0), 
      pbrDelay: Number(pbrDelay || 0), 
      qcDelay: Number(qcDelay || 0)
    };

    let updatedLogs = [...dData.issueLogs];
    const idx = updatedLogs.findIndex(l => l.rawDate === customDate);
    if (idx !== -1) updatedLogs[idx] = newEntry;
    else updatedLogs.push(newEntry);

    try {
      const res = await fetch(`${API_BASE}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dData, shift: activeShift, dept: activeDept, issueLogs: updatedLogs, empId: user?.employeeId, empName: user?.name }),
      });
      if (res.ok) {
        const saved = await res.json();
        setMetrics(prev => prev.map(m => m.letter === 'D' ? saved : m));
        setIsModalOpen(false);
        setLastBackupTime(new Date());
      }
    } catch (e) { alert('Sync failed.'); }
  };

  useEffect(() => {
    fetch(`${API}/api/timelock/${activeDept}/${activeShift}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTimeLock(d))
      .catch(() => {});
  }, [activeShift, activeDept]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    fetchMetrics();
    return () => clearInterval(timer);
  }, [activeShift, activeDept]); // eslint-disable-line react-hooks/exhaustive-deps

  const dynamicDaysData = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days = Array(daysInMonth).fill('none');
    dData.issueLogs.forEach(log => {
      const d = new Date(log.rawDate);
      if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
        const idx = d.getDate() - 1;
        const efficiency = (log.dispatched / (log.planned || 1)) * 100;
        const fail = efficiency < 90 || log.breakdowns > 0;
        if (idx >= 0 && idx < daysInMonth) days[idx] = fail ? 'fail' : 'success';
      }
    });
    return days;
  }, [dData.issueLogs, viewMonth, viewYear]);

  const stats = useMemo(() => ({
    alerts: dynamicDaysData.filter(s => s === 'fail').length,
    success: dynamicDaysData.filter(s => s === 'success').length,
    open: dynamicDaysData.filter(s => s === 'none').length
  }), [dynamicDaysData]);

  const annualTrend = useMemo(() =>
    allYearLogs.map(m => {
      const passCount = m.logs.filter(l => (l.dispatched / (l.planned || 1) * 100) >= 90).length;
      return { name: m.monthName.slice(0, 3), pass: passCount, fail: m.logs.length - passCount };
    }), [allYearLogs]);

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#F8FAFC' });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, pw, (canvas.height * pw) / canvas.width);
    pdf.save(`Delivery_Shift${activeShift}_${activeDept}_${MONTHS[viewMonth]}_${viewYear}.pdf`);
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black text-emerald-500 animate-pulse bg-slate-50">LOADING SYSTEM...</div>;

  return (
    <div ref={reportRef} className="min-h-screen bg-[#F8FAFC] font-sans flex flex-col text-slate-900">
      {/* Custom Styled Alert Popup */}
      {deleteConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-[320px] p-8 shadow-2xl border border-white/20 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={28} />
            </div>
            <h3 className="text-slate-800 font-black uppercase text-sm tracking-widest mb-2">Confirm Delete</h3>
            <p className="text-slate-400 text-[10px] font-bold uppercase leading-relaxed mb-8">
              This action is permanent and will sync with the cloud database immediately.
            </p>
            
            <div className="space-y-3">
              <button 
                onClick={handleDeleteLog}
                className="w-full bg-rose-500 hover:bg-rose-600 py-4 rounded-2xl font-black text-white text-[11px] uppercase shadow-lg shadow-rose-100 transition-all active:scale-95"
              >
                Confirm Deletion
              </button>
              <button 
                onClick={() => setDeleteConfig({ isOpen: false, type: null, index: null, rawDate: null })}
                className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 hover:text-slate-600 transition-colors"
              >
                Nevermind
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="flex justify-between items-center px-4 md:px-8 py-3 bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <button onClick={() => navigate('/')} className="group flex items-center gap-1.5 text-slate-400 font-black text-[10px] uppercase hover:text-emerald-600 transition-all shrink-0">
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> <span className="hidden sm:inline">Back</span>
          </button>
          <div className="h-6 w-[1px] bg-slate-200 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-[11px] font-black uppercase tracking-tighter text-slate-800 truncate">Delivery</h1>
            <p className="text-[9px] font-bold text-emerald-500 uppercase truncate">{DEPT_FULL[activeDept]} · Shift {activeShift}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center shrink-0">
          {timeLock?.enabled && (
            <span className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[10px] font-bold text-amber-700">
              ⏰ {timeLock.startTime} – {timeLock.endTime}
            </span>
          )}
          <button
            onClick={() => {
              const headers = ['Date', 'Planned', 'Dispatched', 'Breakdowns', 'Delay 1', 'Delay 2'];
              const rows = dData.issueLogs.map(l => [l.date || l.rawDate, l.planned, l.dispatched, l.breakdowns, l.pbrDelay, l.qcDelay]);
              const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
              a.download = `Delivery_Shift${activeShift}_${activeDept}.csv`; a.click();
            }}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all">
            <Download size={13} /> <span className="hidden sm:inline">CSV</span>
          </button>
          {canEdit && (
            <button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-200 transition-all active:scale-95">
              <span className="hidden sm:inline">Update Metrics</span><span className="sm:hidden">Update</span>
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 grid grid-cols-12 gap-4 md:gap-6 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
        <div className="col-span-12 md:col-span-6 lg:col-span-3 flex flex-col gap-4 md:gap-6">
          <div className="bg-white rounded-[2rem] p-6 flex flex-col items-center shadow-sm border border-slate-200">
            <div className="flex items-center justify-between w-full mb-6 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
              <button onClick={() => setViewDate(new Date(viewYear, viewMonth - 1, 1))}><ChevronLeft size={16} /></button>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase text-slate-800">{MONTHS[viewMonth]}</span>
                <span className="text-[8px] font-bold text-slate-400">{viewYear}</span>
              </div>
              <button onClick={() => setViewDate(new Date(viewYear, viewMonth + 1, 1))}><ChevronRight size={16} /></button>
            </div>
            <CircularTracker letter="D" daysData={dynamicDaysData} size={180} />
            <div className="grid grid-cols-3 gap-3 w-full mt-8">
              <StatBox val={stats.alerts} label="Failed" color="red" />
              <StatBox val={stats.success} label="Passed" color="emerald" />
              <StatBox val={stats.open} label="Pending" color="slate" />
            </div>
          </div>

          <ChartCard title="Current Month Performance">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={[{ n: 'Fail', v: stats.alerts }, { n: 'Pass', v: stats.success }, { n: 'Open', v: stats.open }]}>
                <XAxis dataKey="n" fontSize={8} axisLine={false} tickLine={false} />
                <Bar dataKey="v" radius={[6, 6, 0, 0]} barSize={30}>
                  <Cell fill="#F43F5E" /><Cell fill="#10B981" /><Cell fill="#E2E8F0" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4 md:gap-6">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden min-h-[320px] max-h-[400px] flex flex-col">
            <SectionHeader icon={<Star size={14} className="text-emerald-500" />} title={deptLabels.archiveTitle} />
            <div className="px-4 md:px-8 py-3 bg-slate-50 grid grid-cols-4 text-[9px] font-black text-slate-400 uppercase border-b border-slate-100">
              <span>Timeline</span><span className="text-center">{deptLabels.targetLabel}</span><span className="text-center">{deptLabels.actualLabel}</span><span className="text-right">Action</span>
            </div>
            <InfiniteScrollList data={allYearLogs} type="dispatch" setDeleteConfig={setDeleteConfig} deptLabels={deptLabels} />
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden min-h-[250px] max-h-[320px] flex flex-col">
            <SectionHeader icon={<Clock size={14} className="text-orange-500" />} title="Problem-Solving Metrics" />
            <div className="px-4 md:px-8 py-3 bg-slate-50 grid grid-cols-5 text-[9px] font-black text-slate-400 uppercase border-b border-slate-100">
              <span>Date</span><span className="text-center">M/C</span><span className="text-center">{deptLabels.delay1Col}</span><span className="text-center">{deptLabels.delay2Col}</span><span className="text-right">Action</span>
            </div>
            <InfiniteScrollList data={allYearLogs} type="minor" setDeleteConfig={setDeleteConfig} deptLabels={deptLabels} />
          </div>
        </div>

        <div className="col-span-12 md:col-span-6 lg:col-span-3 flex flex-col gap-4 md:gap-6">
          <div className="bg-emerald-600 rounded-[2.5rem] p-8 flex flex-col items-center text-white shadow-xl shadow-emerald-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={80} /></div>
            <div className="bg-white/20 px-4 py-1.5 rounded-full text-[9px] font-black uppercase mb-6 backdrop-blur-md">Efficiency Index</div>
            <h4 className="text-5xl font-black tracking-tighter">
              {stats.success + stats.alerts > 0 ? ((stats.success / (stats.success + stats.alerts)) * 100).toFixed(1) : "0.0"}%
            </h4>
            <p className="text-[9px] uppercase mt-4 font-bold opacity-80 tracking-widest">Selected Period Yield</p>
          </div>

          <ChartCard title="Yearly Trend Analysis">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={annualTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} fontWeight={800} tickLine={false} axisLine={false} dy={10} tick={{ fill: '#94a3b8' }} />
                <YAxis fontSize={10} fontWeight={800} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', paddingBottom: '20px' }} />
                <Area name="Pass" type="monotone" dataKey="pass" stroke="#10B981" strokeWidth={3} fill="url(#colorPass)" />
                <Area name="Fail" type="monotone" dataKey="fail" stroke="#F43F5E" strokeWidth={2} fill="url(#colorFail)" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="bg-white rounded-[2rem] p-5 border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">System Engine</span>
              <span className="text-sm font-black text-slate-800 tabular-nums">{currentTime.toLocaleTimeString([], { hour12: false })}</span>
            </div>
            <div className="space-y-3">
              <TipItem icon={<Activity size={12} className="text-emerald-500" />} text={`Last update: ${Math.floor((currentTime - lastBackupTime)/1000)}s ago`} />
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-50 rounded-2xl border border-transparent shrink-0"><Calendar size={12} className="text-blue-500" /></div>
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Shift {activeShift}</p>
                  <p className="text-[11px] font-black text-slate-700">{activeShift === '1' ? '06:00 – 14:00' : '14:00 – 22:00'}</p>
                </div>
              </div>
              {timeLock?.enabled && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-[9px] font-bold text-amber-700">⏰ Save window: {timeLock.startTime} – {timeLock.endTime}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-2">
          <LogContainer title="Personnel Management" data={staffLogs} type="staff" onOpen={() => { if (!canEdit) return; setIsStaffModalOpen(true); }} setDeleteConfig={setDeleteConfig} colorTheme="emerald" />
          <LogContainer title="Operational Activity Tracker" data={activityLogs} type="activity" onOpen={() => { if (!canEdit) return; setIsActivityModalOpen(true); }} setDeleteConfig={setDeleteConfig} colorTheme="blue" />
        </div>
      </main>

      {/* --- Modals --- */}
      <EntryModal isOpen={isStaffModalOpen} onClose={() => setIsStaffModalOpen(false)} title="Personnel Terminal" type="staff" data={staffLogs} 
        onAdd={() => setStaffLogs([{id:"", name:"", action:"", time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false})}, ...staffLogs])}
        onEdit={(i, f, v) => setStaffLogs(prev => { let u = [...prev]; u[i][f] = v; return u; })}
        setDeleteConfig={setDeleteConfig} onSubmit={() => handleLogSubmit('staff')} syncing={tableSyncing.staff} />

      <EntryModal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} title="Activity Log" type="activity" data={activityLogs} 
        onAdd={() => setActivityLogs([{id:"", name:"", action:"", time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false})}, ...activityLogs])}
        onEdit={(i, f, v) => setActivityLogs(prev => { let u = [...prev]; u[i][f] = v; return u; })}
        setDeleteConfig={setDeleteConfig} onSubmit={() => handleLogSubmit('activity')} syncing={tableSyncing.activity} />

      {/* Floating PDF button */}
      <button
        onClick={downloadPDF}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-2xl shadow-emerald-200 flex items-center justify-center z-[90] active:scale-95 transition-all"
        title="Download PDF"
      >
        <Download size={22} />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-[420px] p-8 shadow-2xl">
            <h2 className="font-black text-slate-800 uppercase text-center text-sm mb-2">Update Delivery Log</h2>
            <p className="text-[9px] font-bold text-emerald-500 uppercase text-center mb-6 tracking-widest">{DEPT_FULL[activeDept]} · Shift {activeShift}</p>
            <div className="space-y-3">
              <input type="date" value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                max={user?.role === 'supervisor' ? new Date().toISOString().split('T')[0] : undefined}
                readOnly={user?.role === 'supervisor'}
                title={user?.role === 'supervisor' ? 'Supervisors can only update today' : ''}
                className="w-full bg-slate-50 rounded-2xl p-4 font-bold outline-none" />

              {/* Performance Metrics */}
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest pt-1 border-t border-slate-100">Performance Metrics</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase -mt-1">{deptLabels.planVsActual} — Green: ≥90% · Red: &lt;90%</p>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder={deptLabels.targetLabel} value={plannedCount} onChange={e => setPlannedCount(e.target.value)} className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-[12px]" />
                <input type="number" placeholder={deptLabels.actualLabel} value={dispatchedCount} onChange={e => setDispatchedCount(e.target.value)} className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-[12px]" />
              </div>

              {/* Problem-Solving Metrics */}
              <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest pt-1 border-t border-slate-100">Problem-Solving Metrics</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase -mt-1">Equipment Breakdown — Green: 0 · Red: &gt;0</p>
              <input type="number" placeholder="No. of Equipment Breakdown" value={breakdowns} onChange={e => setBreakdowns(e.target.value)} className="w-full bg-slate-50 rounded-2xl p-4 font-bold" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder={deptLabels.delay1Ph} value={pbrDelay} onChange={e => setPbrDelay(e.target.value)} className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-[10px]" />
                <input type="number" placeholder={deptLabels.delay2Ph} value={qcDelay} onChange={e => setQcDelay(e.target.value)} className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-[10px]" />
              </div>

              <button onClick={handleUpdateStatus} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase mt-2">Commit to Database</button>
              <button onClick={() => setIsModalOpen(false)} className="w-full text-[10px] font-bold text-slate-400 uppercase">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-Components ---

const TableContent = ({ data, type, onEdit, readonly, setDeleteConfig }) => {
  const isStaff = type === 'staff';
  return (
    <div className="flex flex-col flex-1">
      <div className="px-8 py-3 bg-slate-50 grid grid-cols-5 text-[9px] font-black text-slate-400 uppercase sticky top-0 z-10 border-b border-slate-100">
        <span>ID</span><span>Name/Action</span><span className="col-span-2">Details</span><span className="text-right">Action</span>
      </div>
      <div className="flex-1 overflow-y-auto px-8 divide-y divide-slate-50">
        {data.map((log, i) => (
          <div key={i} className="grid grid-cols-5 py-4 items-center group">
            <input disabled={readonly} className={`text-[11px] font-black bg-transparent outline-none ${isStaff ? 'text-emerald-600' : 'text-blue-600'}`} value={log.id} onChange={(e) => onEdit(i, 'id', e.target.value)} />
            <input disabled={readonly} className="text-[12px] font-bold text-slate-700 bg-transparent outline-none" value={log.name} onChange={(e) => onEdit(i, 'name', e.target.value)} />
            <div className="col-span-2 flex items-center gap-2">
              <input disabled={readonly} className="text-[10px] font-bold text-slate-400 uppercase bg-transparent outline-none flex-1" value={log.action} onChange={(e) => onEdit(i, 'action', e.target.value)} />
              <span className="text-[10px] text-slate-300">{log.time}</span>
            </div>
            <div className="text-right">
              {!readonly && (
                <button onClick={() => setDeleteConfig({ isOpen: true, type, index: i })} className="p-2 text-slate-300 hover:text-rose-500 rounded-lg transition-colors"><Trash2 size={14}/></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const minorColor = (value, type) => {
  const n = Number(value);
  if (type === 'pct') return n >= 100 ? 'text-emerald-600' : 'text-rose-500';
  return n === 0 ? 'text-emerald-600' : 'text-rose-500';
};

const minorFmt = (value, unit) => {
  const n = Number(value);
  if (value === '' || value === null || value === undefined) return '-';
  if (unit === 'min') return `${n}m`;
  if (unit === '%') return `${n}%`;
  return `${n}`;
};

const InfiniteScrollList = ({ data, type, setDeleteConfig, deptLabels }) => (
  <div className="flex-1 overflow-y-auto no-scrollbar px-4 md:px-8">
    {data.map(({ monthName, logs }) => logs.length > 0 && (
      <div key={monthName} className="mb-6">
        <div className="sticky top-0 bg-white/90 py-3 text-[9px] font-black text-emerald-600 uppercase border-b border-slate-50 z-10">{monthName}</div>
        {logs.map((log, i) => {
          const efficiency = log.planned > 0 ? (log.dispatched / log.planned) * 100 : 0;
          const dispatchOk = efficiency >= 90;
          return (
            <div key={i} className={`grid ${type === 'dispatch' ? 'grid-cols-4' : 'grid-cols-5'} py-4 text-[11px] border-b border-slate-50 items-center group`}>
              <span className="font-bold text-slate-400">{log.date.split('/')[0]}/{log.date.split('/')[1]}</span>
              {type === 'dispatch' ? (
                <>
                  <span className="text-center text-slate-400 font-bold">{log.planned}</span>
                  <span className={`text-center font-black ${dispatchOk ? 'text-emerald-600' : 'text-rose-500'}`}>{log.dispatched}</span>
                </>
              ) : (
                <>
                  <span className={`text-center font-black ${Number(log.breakdowns) === 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {log.breakdowns ?? '-'}
                  </span>
                  <span className={`text-center font-bold ${minorColor(log.pbrDelay, deptLabels?.delay1Type)}`}>
                    {minorFmt(log.pbrDelay, deptLabels?.delay1Unit)}
                  </span>
                  <span className={`text-center font-bold ${minorColor(log.qcDelay, deptLabels?.delay2Type)}`}>
                    {minorFmt(log.qcDelay, deptLabels?.delay2Unit)}
                  </span>
                </>
              )}
              <div className="text-right">
                <button
                  onClick={() => setDeleteConfig({ isOpen: true, type: type, index: i, rawDate: log.rawDate })}
                  className="opacity-0 group-hover:opacity-100 p-1 text-rose-400 hover:bg-rose-50 rounded transition-all"
                >
                  <Trash2 size={12}/>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    ))}
  </div>
);

const LogContainer = ({ title, data, type, onOpen, colorTheme, setDeleteConfig }) => {
  const theme = THEME_STYLES[colorTheme];
  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[350px]">
      <div className={`px-8 py-5 flex justify-between items-center border-b border-slate-50 ${theme.light}`}>
        <h3 className={`font-black text-[11px] uppercase ${theme.text}`}>{title}</h3>
        <button onClick={onOpen} className={`${theme.bg} text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-md transition-all active:scale-95`}>Update</button>
      </div>
      <TableContent data={data.slice(0, 5)} type={type} readonly setDeleteConfig={setDeleteConfig} />
    </div>
  );
};

const EntryModal = ({ isOpen, onClose, title, type, data, onAdd, onEdit, onSubmit, syncing, setDeleteConfig }) => {
  if (!isOpen) return null;
  const theme = THEME_STYLES[type === 'staff' ? 'emerald' : 'blue'];
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-3xl flex flex-col h-[85vh] shadow-2xl">
        <div className={`p-8 border-b flex justify-between items-center ${theme.light}`}>
          <h2 className={`font-black ${theme.text} uppercase text-[12px]`}>{title}</h2>
          <button onClick={onAdd} className={`${theme.bg} text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-lg transition-all active:scale-95`}>+ New Entry</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TableContent data={data} type={type} onEdit={onEdit} setDeleteConfig={setDeleteConfig} />
        </div>
        <div className="p-8 border-t flex items-center gap-6">
          <button onClick={onClose} className="font-black text-slate-400 text-[10px] uppercase">Discard</button>
          <button onClick={onSubmit} className={`flex-1 ${theme.bg} text-white py-4 rounded-2xl font-black text-[11px] uppercase transition-all active:scale-95`}>
            {syncing ? "Syncing..." : "Save and Push to Cloud"}
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon, title }) => (
  <div className="px-4 md:px-8 py-4 md:py-5 border-b border-slate-50 flex items-center gap-3 bg-white shrink-0">
    <div className="p-2 bg-slate-50 rounded-xl">{icon}</div>
    <h3 className="font-black text-[11px] text-slate-700 uppercase">{title}</h3>
  </div>
);

const StatBox = ({ val, label, color }) => (
  <div className="text-center p-3 rounded-[1.5rem] bg-slate-50 border border-slate-100 transition-transform hover:scale-105">
    <div className={`text-lg font-black ${color === 'emerald' ? 'text-emerald-500' : color === 'red' ? 'text-rose-500' : 'text-slate-400'}`}>{val}</div>
    <div className="text-[8px] font-black uppercase text-slate-400 mt-1">{label}</div>
  </div>
);

const ChartCard = ({ title, children }) => (
  <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 flex flex-col min-h-[240px]">
    <h4 className="font-black text-[9px] text-slate-400 uppercase tracking-widest mb-6 border-l-2 border-emerald-500 pl-3">{title}</h4>
    <div className="flex-1">{children}</div>
  </div>
);

const TipItem = ({ icon, text }) => (
  <div className="flex items-center gap-4 group">
    <div className="p-2.5 bg-slate-50 rounded-2xl border border-transparent">{icon}</div>
    <p className="text-[10px] font-bold text-slate-500 uppercase">{text}</p>
  </div>
);

export default DeliveryPage;