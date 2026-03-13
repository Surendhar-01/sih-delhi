import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Drone, RescueTeam, Task, HazardZone } from '../types';

type AnalyticsDashboardProps = {
  drones: Drone[];
  teams: RescueTeam[];
  tasks: Task[];
  hazards: HazardZone[];
};

export default function AnalyticsDashboard({ drones, teams, tasks, hazards }: AnalyticsDashboardProps) {
  const droneBatteryOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value', max: 100, splitLine: { show: false } },
      yAxis: {
        type: 'category',
        data: drones.map(d => d.name),
        axisLabel: { color: '#9ca3af', fontSize: 10 }
      },
      series: [
        {
          name: 'Battery %',
          type: 'bar',
          data: drones.map(d => ({
            value: Math.round(d.battery),
            itemStyle: {
              color: d.battery > 50 ? '#10b981' : d.battery > 20 ? '#f59e0b' : '#ef4444',
              borderRadius: [0, 4, 4, 0]
            }
          })),
          label: { show: true, position: 'insideRight', formatter: '{c}%', fontSize: 10, color: '#fff' }
        }
      ]
    };
  }, [drones]);

  const teamLoadOption = useMemo(() => {
    return {
      tooltip: { trigger: 'item' },
      legend: { top: 'bottom', textStyle: { color: '#9ca3af', fontSize: 10 } },
      series: [
        {
          name: 'Team Status',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#fff' }
          },
          labelLine: { show: false },
          data: [
            { value: teams.filter(t => t.status === 'available').length, name: 'Available', itemStyle: { color: '#10b981' } },
            { value: teams.filter(t => t.status === 'busy').length, name: 'Deployed', itemStyle: { color: '#f59e0b' } },
            { value: teams.filter(t => t.status === 'offline').length, name: 'Offline', itemStyle: { color: '#ef4444' } }
          ]
        }
      ]
    };
  }, [teams]);

  const taskResolutionOption = useMemo(() => {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const pending = tasks.filter(t => t.status === 'pending' || t.status === 'assigned').length;

    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          name: 'Tasks',
          type: 'pie',
          radius: '70%',
          data: [
            { value: completed, name: 'Completed', itemStyle: { color: '#10b981' } },
            { value: inProgress, name: 'In Progress', itemStyle: { color: '#3b82f6' } },
            { value: pending, name: 'Pending/Assigned', itemStyle: { color: '#ef4444' } }
          ],
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' }
          },
          label: { color: '#9ca3af', fontSize: 10 }
        }
      ]
    };
  }, [tasks]);

  const zoneRisksOption = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    hazards.forEach(h => {
      const s = h.severity as keyof typeof counts;
      if (counts[s] !== undefined) counts[s]++;
    });

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: ['Critical', 'High', 'Medium', 'Low'],
        axisLabel: { color: '#9ca3af', fontSize: 10 }
      },
      yAxis: { type: 'value', splitLine: { show: false }, axisLabel: { color: '#9ca3af', fontSize: 10 } },
      series: [
        {
          name: 'Zones',
          type: 'bar',
          barWidth: '50%',
          data: [
            { value: counts.critical, itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] } },
            { value: counts.high, itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] } },
            { value: counts.medium, itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } },
            { value: counts.low, itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } }
          ]
        }
      ]
    };
  }, [hazards]);

  return (
    <div className="flex xl:flex-col gap-4 h-full overflow-y-auto pr-2 custom-scrollbar">
      
      <div className="bg-white/5 dark:bg-[#121214]/60 p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex-1 min-w-[280px]">
        <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2 flex items-center justify-between">
          Drone Telemetry
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </h3>
        <div className="h-[200px] w-full">
          <ReactECharts option={droneBatteryOption} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>

      <div className="bg-white/5 dark:bg-[#121214]/60 p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex-1 min-w-[280px]">
        <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">
          Team Availability
        </h3>
        <div className="h-[200px] w-full">
          <ReactECharts option={teamLoadOption} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>

      <div className="bg-white/5 dark:bg-[#121214]/60 p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex-1 min-w-[280px]">
        <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">
          Task Resolution Pipeline
        </h3>
        <div className="h-[200px] w-full">
          <ReactECharts option={taskResolutionOption} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>

      <div className="bg-white/5 dark:bg-[#121214]/60 p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex-1 min-w-[280px]">
        <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">
          Hazard Zone Status
        </h3>
        <div className="h-[200px] w-full">
          <ReactECharts option={zoneRisksOption} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>

    </div>
  );
}
