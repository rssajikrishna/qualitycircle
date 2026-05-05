import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import {
  ChevronLeft, ChevronRight, Star, Maximize2,
  Download, Edit3, X, Activity, Trash2, Clock, User
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line
} from 'recharts';
import CircularTracker from '../components/CircularTracker';
import { dashboardMetrics as initialData } from '../dashboardData';

const MySwal = withReactContent(Swal);
const API_BASE_URL = 'http://localhost:5000/api/metrics';
const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const DEPT_FULL = { fg: 'Finished Good Material Warehouse', pm: 'Packing Material Warehouse', rm: 'Raw Material Warehouse' };

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
});

const QualityPage = () => {
  const { shift, dept } = useParams();
  const navigate = useNavigate();
  const reportRef = useRef(null);

  // Safely parse user info
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('userInfo')) || {};
    } catch { return {}; }
  }, []);

  const isSuperAdmin = user?.role === 'superadmin';
  const isSupervisor = user?.role === 'supervisor';
  const userDepts = (user?.department || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAssignedDept = isSuperAdmin || userDepts.includes((dept || '').toLowerCase());
  const canUpdate = (isSupervisor && isAssignedDept) || isSuperAdmin;

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(initialData);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState("Target Met");
  const [deviationType, setDeviationType] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [viewDate, setViewDate] = useState(new Date());
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);

  const [staffLogs, setStaffLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [tableSyncing, setTableSyncing] = useState({ staff: false, activity: false });
  const [timeLock, setTimeLock] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/timelock/${dept || 'fgmw'}/${shift || '1'}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTimeLock(d))
      .catch(() => {});
  }, [shift, dept]);

  const viewMonthName = viewDate.toLocaleString('default', { month: 'long' }).toUpperCase();
  const viewYear = viewDate.getFullYear();

  const qData = useMemo(() => metrics.find(m => m.letter === 'Q') || initialData[0], [metrics]);

  const notifySuccess = (msg) => Toast.fire({ icon: 'success', title: msg });
  const notifyError = (msg) => Toast.fire({ icon: 'error', title: msg });

  const confirmDelete = async (itemType = "record") => {
    return await MySwal.fire({
      title: 'Are you sure?',
      text: `You are about to remove this ${itemType}. This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel',
      reverseButtons: true
    });
  };

  const handleDeleteLog = async (logDate) => {
    const result = await confirmDelete("alert history log");
    if (result.isConfirmed) {
      const updatedLogs = qData.issueLogs.filter(log => log.rawDate !== logDate);
      try {
        const res = await fetch(`${API_BASE_URL}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...qData, shift: shift || '1', dept: dept || 'fgmw', issueLogs: updatedLogs, empId: user?.employeeId, empName: user?.name })
        });
        if (res.ok) {
          const saved = await res.json();
          setMetrics(prev => prev.map(m => m.letter === 'Q' ? saved : m));
          notifySuccess("Log deleted successfully");
        }
      } catch (e) { notifyError("Delete failed"); }
    }
  };

  const handleUpdateStatus = async () => {
    if (!canUpdate) return;
    const resolvedReason = selectedIssue === "Others" ? (customReason.trim() || "Others") : selectedIssue;
    let updatedLogs = Array.isArray(qData.issueLogs) ? [...qData.issueLogs] : [];
    const [y, m, d] = customDate.split('-');
    const newEntry = {
      date: `${d}/${m}/${y}`,
      rawDate: customDate,
      reason: resolvedReason,
      deviationType: resolvedReason === "Target Met" ? "" : deviationType,
      timestamp: new Date().toISOString()
    };

    const idx = updatedLogs.findIndex(log => log.rawDate === customDate);
    if (idx !== -1) updatedLogs[idx] = newEntry; else updatedLogs.push(newEntry);

    try {
      const res = await fetch(`${API_BASE_URL}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...qData, shift: shift || '1', dept: dept || 'fgmw', issueLogs: updatedLogs, empId: user?.employeeId, empName: user?.name })
      });
      if (res.ok) {
        const saved = await res.json();
        setMetrics(prev => prev.map(m => m.letter === 'Q' ? { ...m, ...saved } : m));
        setIsModalOpen(false);
        setDeviationType("");
        setCustomReason("");
        notifySuccess(`Shift ${shift} Updated`);
      } else {
        const err = await res.json().catch(() => ({}));
        notifyError(err.error || 'Save failed — check time lock or connection');
      }
    } catch (e) { notifyError("Sync failed"); }
  };

  const handleUpdateStaff = async () => {
    setTableSyncing(prev => ({ ...prev, staff: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letter: 'Q', shift: shift || '1', dept: dept || 'fgmw', logs: staffLogs, empId: user?.employeeId, empName: user?.name }),
      });
      if (res.ok) notifySuccess("Staff Logs Updated");
      else { const e = await res.json().catch(() => ({})); notifyError(e.error || 'Staff save failed'); }
    } catch (e) { notifyError("Staff sync failed"); }
    finally { setTableSyncing(prev => ({ ...prev, staff: false })); }
  };

  const handleUpdateActivity = async () => {
    setTableSyncing(prev => ({ ...prev, activity: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letter: 'Q', shift: shift || '1', dept: dept || 'fgmw', logs: activityLogs, empId: user?.employeeId, empName: user?.name }),
      });
      if (res.ok) notifySuccess("Activity Logs Updated");
      else { const e = await res.json().catch(() => ({})); notifyError(e.error || 'Activity save failed'); }
    } catch (e) { notifyError("Activity sync failed"); }
    finally { setTableSyncing(prev => ({ ...prev, activity: false })); }
  };

  const handleLogChange = (type, index, field, value) => {
    const setter = type === 'staff' ? setStaffLogs : setActivityLogs;
    setter(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addRow = (type) => {
    const newRow = {
      id: `REF-${Math.floor(Math.random() * 9000 + 1000)}`,
      name: "",
      action: "",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    };
    if (type === 'staff') setStaffLogs(prev => [newRow, ...prev]);
    else setActivityLogs(prev => [newRow, ...prev]);
  };

  const removeRow = async (type, index) => {
    const result = await confirmDelete(type === 'staff' ? "staff log entry" : "activity log entry");
    if (result.isConfirmed) {
      if (type === 'staff') setStaffLogs(prev => prev.filter((_, i) => i !== index));
      else setActivityLogs(prev => prev.filter((_, i) => i !== index));
      notifySuccess("Row removed");
    }
  };

  const downloadCSV = () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = Array.isArray(qData.issueLogs) ? qData.issueLogs : [];
    const headers = ['Date', 'Reason', 'Deviation Type', 'Timestamp'];
    const rows = logs
      .sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate))
      .map(l => [l.date || l.rawDate, l.reason || '', l.deviationType || '', l.timestamp || '']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `Quality_Shift${shift}_${dept}_${today}.csv`;
    a.click();
  };

  const downloadPDF = async () => {
    const loadingSwal = MySwal.fire({
      title: 'Generating PDF...',
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false
    });

    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#F0F4F8" });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Quality_Report_${viewMonthName}_${viewYear}.pdf`);
      loadingSwal.close();
      notifySuccess("Report Downloaded");
    } catch (e) {
      loadingSwal.close();
      notifyError("PDF Generation Failed");
    }
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        // Pass shift and dept as query params
        const url = `${API_BASE_URL}?shift=${shift}&dept=${dept}`;
        const response = await fetch(url);
        const dbData = await response.json();

        if (dbData && Array.isArray(dbData)) {
          // Find the Quality metric for THIS specific shift (filtered by backend)
          const qLive = dbData.find(d => d.letter === 'Q');

          // Update local state with shift-specific data
          setMetrics(dbData);
          setStaffLogs(qLive?.staffLogs || []);
          setActivityLogs(qLive?.activityLogs || []);
        }
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, [shift, dept]); // Refetch whenever the shift changes in the URL

  const daysInViewMonth = useMemo(() => new Date(viewYear, viewDate.getMonth() + 1, 0).getDate(), [viewDate, viewYear]);

  const dynamicDaysData = useMemo(() => {
    const baseDays = Array(daysInViewMonth).fill("none");
    const logs = Array.isArray(qData.issueLogs) ? qData.issueLogs : [];
    logs.forEach(log => {
      const logD = new Date(log.rawDate);
      if (logD.getMonth() === viewDate.getMonth() && logD.getFullYear() === viewYear) {
        const idx = logD.getDate() - 1;
        if (idx >= 0 && idx < baseDays.length) {
          baseDays[idx] = log.reason === "Target Met" ? "success" : "fail";
        }
      }
    });
    return baseDays;
  }, [qData.issueLogs, viewDate, viewYear, daysInViewMonth]);

  const stats = useMemo(() => ({
    alerts: dynamicDaysData.filter(s => s === "fail").length,
    success: dynamicDaysData.filter(s => s === "success").length,
    holiday: dynamicDaysData.filter(s => s === "none").length
  }), [dynamicDaysData]);

  const annualTrend = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const logs = Array.isArray(qData.issueLogs) ? qData.issueLogs : [];
    return months.map((m, i) => {
      const mLogs = logs.filter(l => {
        const d = new Date(l.rawDate);
        return d.getFullYear() === viewYear && d.getMonth() === i;
      });
      return {
        name: m,
        fail: mLogs.filter(l => l.reason !== "Target Met").length,
        pass: mLogs.filter(l => l.reason === "Target Met").length
      };
    });
  }, [qData.issueLogs, viewYear]);

  const filteredLogs = useMemo(() => {
    const logs = Array.isArray(qData.issueLogs) ? qData.issueLogs : [];
    return logs
      .filter(l => {
        const d = new Date(l.rawDate);
        return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewYear;
      })
      .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
  }, [qData.issueLogs, viewDate, viewYear]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white gap-4">
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-emerald-600 font-black uppercase tracking-[0.3em] animate-pulse">Syncing Arcolab Data...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] text-[#334155] font-sans flex flex-col">
      <nav className="flex flex-col sm:flex-row justify-between items-center px-4 sm:px-6 py-4 bg-[#F0F4F8] gap-4 sticky top-0 z-50">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-[#475569] font-bold text-xs uppercase self-start sm:self-center hover:text-emerald-600 transition-colors">
          <ChevronLeft size={20} /> BACK
        </button>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {timeLock?.enabled && (
            <span className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-bold text-amber-700">
              ⏰ Save window: {timeLock.startTime} – {timeLock.endTime}
            </span>
          )}
          <button onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-full font-bold text-xs shadow-sm transition-all">
            <Download size={14}/> CSV
          </button>
          {canUpdate && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-full text-[11px] font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Edit3 size={14} /> UPDATE {viewMonthName.split(' ')[0]} LOGS
            </button>
          )}
        </div>
      </nav>

      <div className="px-4 sm:px-6 mb-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Quality — Shift {shift}</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{DEPT_FULL[dept] || dept?.toUpperCase()}</p>
        </div>
      </div>

      <main ref={reportRef} className="flex-1 grid grid-cols-12 gap-4 sm:gap-5 px-4 sm:px-6 pb-6 bg-[#F0F4F8]">
        {/* Tracker Section */}
        <div className="col-span-12 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col items-center">
          <div className="flex items-center justify-between w-full mb-8 bg-[#F8FAFC] px-4 py-2 rounded-full border border-slate-100">
            <button onClick={() => { const d = new Date(viewDate); d.setMonth(d.getMonth() - 1); setViewDate(d); }} className="text-emerald-500 hover:scale-110 transition p-1"><ChevronLeft size={24} /></button>
            <span className="text-[12px] sm:text-[13px] font-black text-emerald-600 tracking-widest text-center">{viewMonthName} {viewYear}</span>
            <button onClick={() => { const d = new Date(viewDate); d.setMonth(d.getMonth() + 1); setViewDate(d); }} className="text-emerald-500 hover:scale-110 transition p-1"><ChevronRight size={24} /></button>
          </div>
          <span className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{qData.name}</span>
          <div className="flex-1 flex items-center justify-center min-h-[250px] w-full max-w-[300px] relative">
            <CircularTracker letter={qData.letter} daysData={dynamicDaysData} size={window.innerWidth < 640 ? 220 : 280} />
          </div>
          <div className="grid grid-cols-3 gap-2 w-full mt-6">
            <StatBox val={stats.alerts} label="Alerts" type="red" />
            <StatBox val={stats.success} label="Success" type="green" />
            <StatBox val={stats.holiday} label="Holiday" type="slate" />
          </div>
        </div>

        {/* History Table */}
        <div className="col-span-12 md:col-span-6 lg:col-span-4 flex flex-col gap-5">
          <ChartCard title={`${viewMonthName} ALERT HISTORY`}>
            <div className="overflow-y-auto pr-2 custom-scrollbar max-h-[320px] min-h-[200px]">
              <table className="w-full text-[11px] border-separate border-spacing-0">
                <thead className="bg-[#E2E8F0] sticky top-0 z-20 shadow-sm text-[#64748B] font-black uppercase">
                  <tr>
                    <th className="p-2 text-left rounded-tl-xl">Date</th>
                    <th className="p-2 text-left">Reason</th>
                    <th className="p-2 text-left">Deviation</th>
                    <th className="p-2 text-right rounded-tr-xl">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length > 0 ? filteredLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 font-bold text-slate-500 whitespace-nowrap">{log.date}</td>
                      <td className={`p-2 font-black uppercase tracking-tight ${log.reason === 'Target Met' ? 'text-emerald-500' : 'text-red-500'}`}>
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${log.reason === 'Target Met' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                          {log.reason}
                        </div>
                      </td>
                      <td className="p-2 font-bold text-slate-500 text-[10px]">{log.deviationType || '--'}</td>
                      <td className="p-2 text-right">
                        {isSuperAdmin && (
                          <button onClick={() => handleDeleteLog(log.rawDate)} className="text-red-300 hover:text-red-600 p-1 transition-colors"><Trash2 size={16} /></button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="p-12 text-center text-slate-300 font-bold uppercase italic tracking-widest">No alerts recorded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title={`${viewYear} PERFORMANCE SUMMARY`}>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="min-w-full text-left text-[10px]">
                <thead className="bg-[#F1F5F9] text-[#64748B] font-black uppercase">
                  <tr>
                    <th className="p-3">Category</th>
                    {annualTrend.map(m => <th key={m.name} className="p-3 text-center">{m.name}</th>)}
                  </tr>
                </thead>
                <tbody className="font-bold divide-y divide-slate-100">
                  <tr>
                    <td className="p-3 text-slate-500">Alerts</td>
                    {annualTrend.map((m, i) => <td key={i} className={`p-3 text-center ${m.fail > 0 ? 'text-red-500' : 'text-slate-200'}`}>{m.fail || '--'}</td>)}
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-500">Success</td>
                    {annualTrend.map((m, i) => <td key={i} className={`p-3 text-center ${m.pass > 0 ? 'text-emerald-500' : 'text-slate-200'}`}>{m.pass || '--'}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>

        {/* Charts Column */}
        <div className="col-span-12 md:col-span-6 lg:col-span-5 flex flex-col gap-5">
          <ChartCard title={`${viewMonthName} DISTRIBUTION`}>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Alerts', value: stats.alerts },
                  { name: 'Success', value: stats.success },
                  { name: 'Holiday', value: stats.holiday }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50}>
                    <Cell fill="#EF4444" /><Cell fill="#10b981" /><Cell fill="#94A3B8" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title={`${viewYear} PERFORMANCE TREND`}>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={annualTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="fail" stroke="#EF4444" strokeWidth={3} dot={{ r: 4, fill: '#EF4444' }} name="Alerts" />
                  <Line type="monotone" dataKey="pass" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} name="Success" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Bottom Logs */}
        <div className="col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LogTable
            type="staff"
            title="Team & Staff Compliance"
            icon={<User size={14} className="text-emerald-500" />}
            logs={staffLogs}
            isSuperAdmin={isSuperAdmin}
            onAdd={() => addRow('staff')}
            onUpdate={handleUpdateStaff}
            onRemove={(i) => removeRow('staff', i)}
            onChange={(i, f, v) => handleLogChange('staff', i, f, v)}
            loading={tableSyncing.staff}
            theme="emerald"
          />

          <LogTable
            type="activity"
            title="Operational Quality Logs"
            icon={<Activity size={14} className="text-blue-500" />}
            logs={activityLogs}
            isSuperAdmin={isSuperAdmin}
            onAdd={() => addRow('activity')}
            onUpdate={handleUpdateActivity}
            onRemove={(i) => removeRow('activity', i)}
            onChange={(i, f, v) => handleLogChange('activity', i, f, v)}
            loading={tableSyncing.activity}
            theme="blue"
          />
        </div>
      </main>

      {/* Floating Action Button */}
      <button onClick={downloadPDF} className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 hover:bg-emerald-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-[90]">
        <Download size={24} />
      </button>

      {/* Update Modal */}
      {isModalOpen && canUpdate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[400px] p-6 sm:p-8 border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-black uppercase tracking-widest text-[10px] flex items-center gap-2 text-slate-800">
                <Edit3 size={16} className="text-emerald-500" /> LOG RECORD
              </h2>
              <button onClick={() => { setIsModalOpen(false); setCustomReason(""); }} className="text-slate-300 hover:text-red-500"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 ml-1">Date</label>
                <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                  readOnly={isSupervisor} disabled={isSupervisor}
                  max={isSupervisor ? new Date().toISOString().split('T')[0] : undefined}
                  title={isSupervisor ? 'Supervisors can only edit today' : ''}
                  className={`w-full bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 text-sm outline-none focus:ring-2 ring-emerald-500 ${isSupervisor ? 'opacity-60 cursor-not-allowed' : ''}`} />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 ml-1">Reason</label>
                <select value={selectedIssue} onChange={(e) => { setSelectedIssue(e.target.value); setCustomReason(""); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 text-sm outline-none focus:ring-2 ring-emerald-500">
                  <option value="Target Met">✅ Target Met</option>
                  <option value="Machine Breakdown">⚠️ Machine Breakdown</option>
                  <option value="No Power">⚠️ No Power</option>
                  <option value="No Manpower">⚠️ No Manpower</option>
                  <option value="Quality Reject">⚠️ Quality Reject</option>
                  <option value="Others">✏️ Others</option>
                </select>
              </div>
              {selectedIssue === "Others" && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 ml-1">Specify Reason</label>
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter custom reason..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 text-sm outline-none focus:ring-2 ring-emerald-500"
                  />
                </div>
              )}
              {selectedIssue !== "Target Met" && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 ml-1">Deviation Type</label>
                  <select value={deviationType} onChange={(e) => setDeviationType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 text-sm outline-none focus:ring-2 ring-emerald-500">
                    <option value="">-- Select Deviation Type --</option>
                    <option value="Human Error">Human Error</option>
                    <option value="Process Error">Process Error</option>
                  </select>
                </div>
              )}
              <button onClick={handleUpdateStatus} className="w-full bg-emerald-600 py-3 sm:py-4 rounded-xl font-black uppercase text-[11px] text-white tracking-widest hover:bg-emerald-700 active:scale-95 transition-all">UPDATE DATA</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- SUB-COMPONENTS ---

const LogTable = ({ title, icon, logs, isSuperAdmin, onAdd, onUpdate, onRemove, onChange, loading, theme }) => {
  // Fix for Tailwind Dynamic classes: Map strings to constant class names
  const themeStyles = {
    emerald: {
      bg: 'bg-emerald-50/30',
      text: 'text-emerald-800',
      btn: 'bg-emerald-600 hover:bg-emerald-700'
    },
    blue: {
      bg: 'bg-blue-50/30',
      text: 'text-blue-800',
      btn: 'bg-blue-600 hover:bg-blue-700'
    }
  };

  const style = themeStyles[theme] || themeStyles.emerald;

  return (
    <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[350px]">
      <div className={`px-5 py-4 flex items-center justify-between border-b border-slate-50 ${style.bg}`}>
        <div className="flex items-center gap-2">
          {icon}
          <h3 className={`font-black text-[10px] ${style.text} tracking-widest uppercase`}>{title}</h3>
        </div>
        <div className="flex gap-2">
          <button onClick={onAdd} className="bg-white border border-slate-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-slate-50">Add Row</button>
          <button onClick={onUpdate} disabled={loading} className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase text-white shadow-sm transition-all ${loading ? 'bg-slate-300' : `${style.btn} active:scale-95`}`}>
            {loading ? 'Syncing...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 bg-slate-50 flex gap-4 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
        <span className="w-20">Emp ID / Ref</span>
        <span className="flex-1">Name / Description</span>
        <span className="flex-1">Action Taken</span>
        <span className="w-12 text-right">Time</span>
        {isSuperAdmin && <span className="w-6"></span>}
      </div>

      <div className="overflow-y-auto flex-1 p-4 divide-y divide-slate-100 custom-scrollbar">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-[10px] font-bold py-10">No records found</div>
        ) : logs.map((log, i) => (
          <div key={i} className="py-2.5 flex gap-4 items-center group hover:bg-slate-50/50 rounded-lg transition-colors px-2">
            <input
              className="w-20 text-[10px] font-bold text-slate-500 bg-slate-100/50 p-1.5 rounded border border-transparent focus:border-slate-300 outline-none"
              value={log.id}
              onChange={(e) => onChange(i, 'id', e.target.value)}
            />
            <input
              className="flex-1 text-[11px] font-bold text-slate-700 outline-none border-b border-transparent focus:border-emerald-300 transition-colors bg-transparent"
              placeholder="Name/Item"
              value={log.name}
              onChange={(e) => onChange(i, 'name', e.target.value)}
            />
            <input
              className="flex-1 text-[10px] font-medium text-slate-500 outline-none border-b border-transparent focus:border-emerald-300 bg-transparent"
              placeholder="Detailed action..."
              value={log.action}
              onChange={(e) => onChange(i, 'action', e.target.value)}
            />
            <div className="flex items-center gap-1 w-12 text-right">
              <Clock size={10} className="text-slate-300" />
              <span className="text-[9px] font-black text-slate-400">{log.time}</span>
            </div>
            {isSuperAdmin && (
              <button onClick={() => onRemove(i)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const StatBox = ({ val, label, type }) => {
  const styles = {
    red: "bg-red-50 border-red-100 text-red-600",
    green: "bg-emerald-50 border-emerald-100 text-emerald-600",
    slate: "bg-slate-50 border-slate-100 text-slate-500"
  };
  return (
    <div className={`p-3 rounded-2xl border text-center ${styles[type]}`}>
      <div className="text-xl font-black leading-none">{val}</div>
      <div className="text-[8px] font-black uppercase tracking-tighter mt-1 opacity-70">{label}</div>
    </div>
  );
};

const ChartCard = ({ title, children }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-50 flex justify-between items-center bg-white">
      <div className="flex items-center gap-2 text-[#64748B] font-black uppercase text-[10px] tracking-widest">
        <Star size={12} className="text-emerald-500" /> {title}
      </div>
      <Maximize2 size={12} className="text-slate-300" />
    </div>
    <div className="p-5 flex-1">{children}</div>
  </div>
);

export default QualityPage;   