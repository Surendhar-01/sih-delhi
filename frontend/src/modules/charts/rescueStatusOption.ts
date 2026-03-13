import { translations, Language } from '../../translations';

export interface RescueStatusData {
  completed: number;
  active: number;
  pending: number;
  critical: number;
  returning: number;
}

export const buildRescueStatusOption = (chartData: RescueStatusData, lang: Language = 'en') => {
  const t = translations[lang];
  const seriesData = [
    { value: chartData.completed, name: t.completed, itemStyle: { color: '#10b981' } },
    { value: chartData.active, name: t.active, itemStyle: { color: '#3b82f6' } },
    { value: chartData.pending, name: t.pending, itemStyle: { color: '#f59e0b' } },
    { value: chartData.critical, name: t.critical, itemStyle: { color: '#ef4444' } },
    { value: chartData.returning, name: t.returning, itemStyle: { color: '#8b5cf6' } }
  ];
  const total = seriesData.reduce((sum, item) => sum + item.value, 0);

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: 'rgba(31, 41, 55, 0.9)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: {
        color: '#ffffff'
      }
    },
    legend: {
      orient: 'horizontal',
      bottom: '0%',
      left: 'center',
      selectedMode: false,
      textStyle: {
        color: '#ffffff',
        fontSize: 10
      }
    },
    graphic: total === 0 ? {
      type: 'text',
      left: 'center',
      top: 'middle',
      style: {
        text: 'No active rescue data',
        fill: '#94a3b8',
        fontSize: 12,
        fontWeight: 600
      }
    } : undefined,
    series: [
      {
        name: 'Rescue Status',
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['50%', '50%'],
        roseType: 'radius',
        stillShowZeroSum: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: 'rgba(0, 0, 0, 0.3)',
          borderWidth: 2,
          shadowBlur: 30,
          shadowColor: 'rgba(0, 0, 0, 0.6)',
          shadowOffsetX: 5,
          shadowOffsetY: 5
        },
        label: {
          show: total > 0,
          color: '#ffffff',
          fontSize: 10,
          formatter: '{b}\n{d}%'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold'
          },
          itemStyle: {
            shadowBlur: 40,
            shadowColor: 'rgba(255, 255, 255, 0.2)'
          }
        },
        data: seriesData
      }
    ]
  };
};
