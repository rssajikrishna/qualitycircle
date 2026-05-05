import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const EHS_ROWS = [
  { category: 'Quality Compliance',      kpiMetric: 'EHS-Related Observation (Yesterday)' },
  { category: 'Incident Management',     kpiMetric: 'Safety Incidents (Yesterday)' },
  { category: 'Incident Management',     kpiMetric: 'Near Miss Reports' },
  { category: 'Incident Management',     kpiMetric: 'First Aid Cases' },
  { category: 'Permit to Work (PTW)',    kpiMetric: 'Total PTWs Issued' },
  { category: 'Permit to Work (PTW)',    kpiMetric: 'PTW Non-Compliance Observed - YESTERDAY' },
  { category: 'Behavior-Based Safety',  kpiMetric: 'Unsafe Act / Condition Reported' },
  { category: 'Behavior-Based Safety',  kpiMetric: 'BBS Observations Validated' },
  { category: 'Emergency Preparedness', kpiMetric: 'Eye Wash / Shower Checked' },
  { category: 'Emergency Preparedness', kpiMetric: 'Fire Extinguisher Pressure & Tag Check' },
  { category: 'Emergency Preparedness', kpiMetric: 'Fire Hydrant Visual Inspection' },
  { category: 'Emergency Preparedness', kpiMetric: 'Fire Alarm & Detection System Check' },
  { category: 'Emergency Preparedness', kpiMetric: 'Fire Alarm Drill / Mock Drill' },
  { category: 'Environment - Water',    kpiMetric: 'Water Consumption (Process & Domestic)' },
  { category: 'Environment - Water',    kpiMetric: 'ETP/STP Inlet vs Outlet (Treated Water Quality)' },
  { category: 'Environment - Water',    kpiMetric: 'ETP - RO - Treated Water Reused' },
  { category: 'Environment - Air',      kpiMetric: 'DG Stack Emission Monitoring' },
  { category: 'Environment - Air',      kpiMetric: 'Boiler Stack Monitoring' },
  { category: 'Industrial Hygiene',     kpiMetric: 'Noise Level Monitoring (dB)' },
  { category: 'Waste Management',       kpiMetric: 'Biomedical Waste Disposed' },
  { category: 'Waste Management',       kpiMetric: 'Hazardous Waste Storage Condition' },
  { category: 'Waste Management',       kpiMetric: 'Empty Drum Disposal Pending' },
  { category: 'PPE Management',         kpiMetric: 'PPE Stock Availability' },
  { category: 'PPE Management',         kpiMetric: 'PPE Non-Compliance Observed' },
  { category: 'Training & Awareness',   kpiMetric: 'Safety Toolbox Talk Conducted' },
  { category: 'Training & Awareness',   kpiMetric: 'ERT Members Trained / Refresher' },
  { category: 'Training & Awareness',   kpiMetric: 'Induction Training (New Joiners)' },
  { category: 'Audit & Compliance',     kpiMetric: 'Daily Safety Rounds' },
  { category: 'Audit & Compliance',     kpiMetric: 'Legal Registers & Records Updated' },
  { category: 'Audit & Compliance',     kpiMetric: 'External Audit / Visit' },
];

const COLS = [
  { key: 'targetValue',  label: 'Target' },
  { key: 'actualValue',  label: 'Actual' },
  { key: 'statusRag',    label: 'Status (RAG)', isRag: true },
  { key: 'remarks',      label: 'Remarks / Action Items', wide: true },
  { key: 'actionOwner',  label: 'Action Owner' },
  { key: 'targetDate',   label: 'Target Date', isDate: true },
  { key: 'actionStatus', label: 'Status' },
];

const DEFAULT_ENTRY = { targetValue: '', actualValue: '', statusRag: '', remarks: '', actionOwner: '', targetDate: '', actionStatus: '' };

const computeSpans = (rows) => {
  const result = [];
  let i = 0;
  while (i < rows.length) {
    const cat = rows[i].category;
    let count = 0;
    while (i + count < rows.length && rows[i + count].category === cat) count++;
    for (let j = 0; j < count; j++) result.push({ showCat: j === 0, catSpan: j === 0 ? count : 0 });
    i += count;
  }
  return result;
};
const SPANS = computeSpans(EHS_ROWS);

const ragStyle = (rag) => {
  if (rag === 'Green') return 'bg-green-50 text-green-700 border-green-300';
  if (rag === 'Amber') return 'bg-amber-50 text-amber-700 border-amber-300';
  if (rag === 'Red')   return 'bg-red-50 text-red-700 border-red-300';
  return 'bg-white text-slate-600 border-slate-200';
};

const downloadCSV = (entries, shift, date) => {
  const headers = ['Category', 'KPI / Metric', 'Target', 'Actual', 'Status (RAG)', 'Remarks / Action Items', 'Action Owner', 'Target Date', 'Status'];
  const rows = EHS_ROWS.map((row, i) => [
    row.category, row.kpiMetric,
    entries[i]?.targetValue || '', entries[i]?.actualValue || '',
    entries[i]?.statusRag   || '', entries[i]?.remarks      || '',
    entries[i]?.actionOwner || '', entries[i]?.targetDate   || '',
    entries[i]?.actionStatus || '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `EHS_Shift${shift}_${date}.csv`;
  a.click();
};

export default function EHS() {
  const navigate  = useNavigate();
  const reportRef = useRef(null);
  const user      = JSON.parse(localStorage.getItem('userInfo') || 'null');
  const isSupervisor = user?.role === 'supervisor';
  const isSuperAdmin = user?.role === 'superadmin';
  const userDepts  = (user?.department || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const canEdit    = (isSupervisor && userDepts.includes('ehs')) || isSuperAdmin;
  const today     = new Date().toISOString().split('T')[0];

  const [shift,   setShift]   = useState('1');
  const [date,    setDate]    = useState(today);
  const [entries, setEntries] = useState(EHS_ROWS.map(() => ({ ...DEFAULT_ENTRY })));
  const [empId,   setEmpId]   = useState('');
  const [empName, setEmpName] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [timeLock, setTimeLock] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/timelock/ehs/${shift}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTimeLock(d))
      .catch(() => {});
  }, [shift]);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/ehs?date=${date}&shift=${shift}`);
      const data = await res.json();
      const saved = data.entries || [];
      setEntries(EHS_ROWS.map((_, i) => {
        const found = saved.find(e => e.rowIndex === i);
        return found ? { ...DEFAULT_ENTRY, ...found } : { ...DEFAULT_ENTRY };
      }));
      if (data.empId)   setEmpId(data.empId);
      if (data.empName) setEmpName(data.empName);
    } catch {
      setEntries(EHS_ROWS.map(() => ({ ...DEFAULT_ENTRY })));
    }
  }, [date, shift]);

  useEffect(() => { load(); }, [load]);

  const change = (i, field, value) =>
    setEntries(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: value }; return n; });

  const save = async () => {
    if (!empId.trim() || !empName.trim()) {
      setSaveMsg('Employee ID and Employee Name are required');
      setTimeout(() => setSaveMsg(''), 3000);
      return;
    }
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`${API}/api/ehs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, shift, entries: entries.map((e, i) => ({ rowIndex: i, ...e })), empId, empName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaveMsg('Saved successfully');
    } catch (err) {
      setSaveMsg(err.message || 'Failed to save');
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 4000);
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#F8FAFC' });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    pdf.addImage(img, 'PNG', 0, 0, pw, (canvas.height * pw) / canvas.width);
    pdf.save(`EHS_Shift${shift}_${date}.pdf`);
  };

  const SaveBtn = ({ cls = '' }) => (
    <button onClick={save} disabled={saving}
      className={`px-8 py-2.5 bg-lime-600 hover:bg-lime-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-lime-200 transition-all disabled:opacity-60 ${cls}`}>
      {saving ? 'Saving…' : 'Save'}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-gradient-to-b from-lime-600 to-lime-800 pt-20 pb-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 flex items-end justify-end pr-10 pb-4 pointer-events-none">
          <span className="text-[10rem] font-black text-white/5 leading-none">EHS</span>
        </div>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto text-center relative z-10">
          <button onClick={() => navigate('/')}
            className="mb-6 px-4 py-1.5 bg-white/10 hover:bg-white/20 transition-colors rounded-full text-white/80 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
            ← Back to Dashboard
          </button>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase mb-4">
            Environment, Health & Safety
          </h1>
          <p className="text-white/60 text-sm font-medium">EHS Daily Huddle Board</p>
        </motion.div>
      </div>

      <div ref={reportRef} className="max-w-screen-xl mx-auto px-4 -mt-16 relative z-20 pb-12">
        {/* Controls */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl p-5 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Shift tabs */}
            <div className="flex gap-2">
              {['1', '2', '3'].map(s => (
                <button key={s} onClick={() => setShift(s)}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${shift === s ? 'bg-lime-600 text-white shadow-lg shadow-lime-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  Shift {s}
                </button>
              ))}
            </div>

            {timeLock?.enabled && (
              <span className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[10px] font-bold text-amber-700">
                ⏰ Save window: {timeLock.startTime} – {timeLock.endTime}
              </span>
            )}

            {/* Date */}
            <input type="date" value={date}
              onChange={e => setDate(e.target.value)}
              readOnly={isSupervisor} disabled={isSupervisor}
              max={isSupervisor ? today : undefined}
              className={`px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 focus:outline-none focus:border-lime-500 ${isSupervisor ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
            />

            {/* Emp ID */}
            <input type="text" placeholder="Employee ID" value={empId}
              onChange={e => setEmpId(e.target.value)}
              readOnly={!canEdit} disabled={!canEdit}
              className={`px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 focus:outline-none focus:border-lime-500 w-36 uppercase ${!canEdit ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
            />

            {/* Emp Name */}
            <input type="text" placeholder="Employee Name" value={empName}
              onChange={e => setEmpName(e.target.value)}
              readOnly={!canEdit} disabled={!canEdit}
              className={`px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 focus:outline-none focus:border-lime-500 w-44 ${!canEdit ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
            />

            {saveMsg && (
              <span className={`text-sm font-semibold ${saveMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                {saveMsg}
              </span>
            )}

            <div className="ml-auto flex gap-2">
              <button onClick={downloadPDF}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">
                <Download size={15} /> PDF
              </button>
              <button onClick={() => downloadCSV(entries, shift, date)}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all">
                <Download size={15} /> CSV
              </button>
              {canEdit && <SaveBtn />}
            </div>
          </div>
        </motion.div>

        {/* Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: 1000 }}>
              <thead>
                <tr className="bg-lime-700 text-white text-xs uppercase tracking-wider">
                  <th className="px-4 py-3.5 text-left font-bold w-44">Category</th>
                  <th className="px-4 py-3.5 text-left font-bold w-56">KPI / Metric</th>
                  {COLS.map(col => (
                    <th key={col.key} className={`px-3 py-3.5 text-left font-bold ${col.wide ? 'w-52' : 'w-28'}`}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EHS_ROWS.map((row, i) => {
                  const span = SPANS[i];
                  return (
                    <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      {span.showCat && (
                        <td rowSpan={span.catSpan}
                          className="px-4 py-3 text-xs font-semibold text-lime-800 bg-lime-50 border-r border-lime-100 align-middle leading-tight">
                          {row.category}
                        </td>
                      )}
                      <td className="px-4 py-2 text-xs text-slate-600 border-r border-slate-100">{row.kpiMetric}</td>
                      {COLS.map(col => (
                        <td key={col.key} className="px-2 py-1.5">
                          {col.isRag ? (
                            <select value={entries[i][col.key] || ''} onChange={e => canEdit && change(i, col.key, e.target.value)}
                              disabled={!canEdit}
                              className={`w-full rounded-lg px-2 py-1.5 text-xs border focus:outline-none focus:ring-1 focus:ring-lime-400 ${ragStyle(entries[i][col.key])} ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
                              <option value="">-</option>
                              <option value="Green">✅ Green</option>
                              <option value="Amber">⚠️ Amber</option>
                              <option value="Red">🔴 Red</option>
                            </select>
                          ) : col.isDate ? (
                            <input type="date" value={entries[i][col.key] || ''} onChange={e => change(i, col.key, e.target.value)}
                              readOnly={!canEdit} disabled={!canEdit}
                              className={`w-full rounded-lg px-2 py-1.5 text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-lime-400 ${!canEdit ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`} />
                          ) : (
                            <input type="text" value={entries[i][col.key] || ''} onChange={e => change(i, col.key, e.target.value)}
                              readOnly={!canEdit} disabled={!canEdit}
                              placeholder="-"
                              className={`w-full rounded-lg px-2 py-1.5 text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-lime-400 ${!canEdit ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-slate-100 flex flex-wrap gap-6 items-center bg-slate-50/60">
            <span className="text-[10px] font-black text-lime-400 uppercase tracking-widest">Status Key:</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>Green — On Track</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>Amber — Needs Attention</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>Red — Critical / Delayed</span>
          </div>
          {canEdit && (
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <SaveBtn />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
