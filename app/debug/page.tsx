'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import Link from 'next/link';
import { 
  Tv, 
  Users, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Cpu, 
  Zap, 
  Workflow, 
  History,
  Terminal,
  RotateCw,
  ArrowLeft
} from 'lucide-react';

export default function DebugDashboard() {
  const [activeUsers, setActiveUsers] = useState(1);
  const [awsConsoleLogs, setAwsConsoleLogs] = useState([
    'Initializing local AWS Stack simulation...',
    'ALB Proxy listening on port 80...',
  ]);
  const [servicesStatus, setServicesStatus] = useState({
    proxy: 'checking',
    api: 'checking',
    websocket: 'checking',
    rds: 'checking',
    redis: 'checking',
    sqs: 'checking'
  });

  const socketRef = useRef(null);

  // Helper logger for AWS Cloud Console events simulation
  const logAwsEvent = useCallback((msg: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setAwsConsoleLogs(prev => [`[${timestamp}] ${msg}`, ...prev].slice(0, 45));
  }, []);

  // Poll AWS Local Services Health
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setServicesStatus({
          proxy: 'ok',
          api: data.services.api === 'ok' ? 'ok' : 'error',
          websocket: socketRef.current?.connected ? 'ok' : 'error',
          rds: data.services.database === 'ok' ? 'ok' : 'error',
          redis: data.services.cache === 'ok' ? 'ok' : 'error',
          sqs: 'ok'
        });
      } else {
        throw new Error('API down');
      }
    } catch (err) {
      setServicesStatus({
        proxy: 'ok',
        api: 'error',
        websocket: socketRef.current?.connected ? 'ok' : 'error',
        rds: 'error',
        redis: 'error',
        sqs: 'error'
      });
    }
  }, []);

  // Initialize WebSockets and Health Checks
  useEffect(() => {
    const socketUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://localhost';
    const socket = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to real-time ECS WebSocket service');
      logAwsEvent('ECS WebSocket server connection established (Port 80 routing)');
      setServicesStatus(prev => ({ ...prev, websocket: 'ok' }));
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSockets');
      logAwsEvent('ECS WebSocket connection terminated');
      setServicesStatus(prev => ({ ...prev, websocket: 'error' }));
    });

    socket.on('active_users_update', (data) => {
      setActiveUsers(data.count);
    });

    socket.on('arena_notification', (data) => {
      logAwsEvent(`WS Broadcast event [${data.type}]: ${data.nombre || 'Arena'} - Score: ${data.score || ''}`);
    });

    socket.on('connect_error', () => {
      logAwsEvent('ECS WebSocket connection error');
      setServicesStatus(prev => ({ ...prev, websocket: 'error' }));
    });

    // Initial check
    checkHealth();

    // Interval healthcheck polling
    const healthInterval = setInterval(checkHealth, 3500);

    return () => {
      socket.disconnect();
      clearInterval(healthInterval);
    };
  }, [checkHealth, logAwsEvent]);

  const getStatusIcon = (status: string) => {
    if (status === 'ok') return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.2)]">● Online</span>;
    if (status === 'error') return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-1 shadow-[0_0_8px_rgba(239,68,68,0.2)]">▲ Offline</span>;
    return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1 animate-pulse">■ Checking</span>;
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center p-4 sm:p-6 md:p-8 bg-[#06060c] font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(at_50%_50%,rgba(6,6,12,1)_0%,transparent_100%),linear-gradient(rgba(18,18,30,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,30,0.4)_1px,transparent_1px)] bg-[size:100%_100%,30px_30px,30px_30px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* HEADER */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-8 z-10">
        <Link 
          href="/" 
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass-panel hover:text-cyan-400 transition-all font-semibold text-sm group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Volver al Lobby</span>
        </Link>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 glass-panel px-3 py-1.5 rounded-full text-xs font-semibold">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Active Connections:</span>
            <span className="text-cyan-400 text-sm font-bold font-mono animate-pulse">{activeUsers}</span>
          </div>
        </div>
      </header>

      {/* DEBUG PANEL */}
      <main className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 gap-8 z-10 my-auto">
        {/* Left column: Microservices Info */}
        <section className="md:col-span-4 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 shadow-lg">
            <h2 className="text-lg font-black tracking-widest text-slate-200 mb-6 uppercase flex items-center gap-2 border-b border-slate-900 pb-3">
              <Cpu className="w-5 h-5 text-cyan-400" />
              AWS Cloud Console
            </h2>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-900/30 text-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-400">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>ALB Proxy Port 80</span>
                </div>
                {getStatusIcon(servicesStatus.proxy)}
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-900/30 text-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-400">
                  <Workflow className="w-4 h-4 text-fuchsia-400" />
                  <span>API Service (ECS)</span>
                </div>
                {getStatusIcon(servicesStatus.api)}
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-900/30 text-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-400">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span>Sockets (ECS WebSocket)</span>
                </div>
                {getStatusIcon(servicesStatus.websocket)}
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-900/30 text-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-400">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>RDS PostgreSQL</span>
                </div>
                {getStatusIcon(servicesStatus.rds)}
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-900/30 text-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-400">
                  <Cpu className="w-4 h-4 text-red-400" />
                  <span>ElastiCache Redis</span>
                </div>
                {getStatusIcon(servicesStatus.redis)}
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-900/30 text-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-400">
                  <History className="w-4 h-4 text-amber-500" />
                  <span>SQS Queue Broker</span>
                </div>
                {getStatusIcon(servicesStatus.sqs)}
              </div>
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 text-xs text-slate-400 flex flex-col gap-2">
            <h4 className="font-extrabold uppercase text-slate-300 tracking-wider">AWS Architecture Specs</h4>
            <p><strong>Nginx:</strong> Acts as an Elastic Load Balancer (ELB) distributing socket traffic and API requests.</p>
            <p><strong>ECS API:</strong> Express.js server, scaled with multiple replicas for high-availability database connections.</p>
            <p><strong>Redis:</strong> Captures high scores instantly to populate the real-time global leaderboard.</p>
            <p><strong>SQS Queue:</strong> Decouples gameplay actions to let worker threads process score achievements asynchronously.</p>
          </div>
        </section>

        {/* Right column: Large Cloudwatch Console Logs */}
        <section className="md:col-span-8 flex flex-col">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex-grow flex flex-col shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b border-slate-900 pb-3">
              <h2 className="text-sm font-black tracking-widest text-slate-200 uppercase flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400 animate-pulse" />
                Amazon CloudWatch Logs
              </h2>
              <button 
                onClick={() => setAwsConsoleLogs([`[${new Date().toISOString().substring(11, 19)}] Logs cleared manually.`])} 
                className="text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase"
              >
                Clear Log View
              </button>
            </div>
            
            <div className="w-full flex-grow bg-black/60 border border-slate-950 rounded-xl p-4 font-mono text-xs text-emerald-400/90 h-[480px] overflow-y-auto flex flex-col gap-2 shadow-inner">
              {awsConsoleLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed border-b border-slate-900/40 pb-2 flex gap-3">
                  <span className="text-slate-600 flex-shrink-0 select-none">AWS-SYS-LOG &gt;</span>
                  <span className="break-all">{log}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
