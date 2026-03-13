import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Language } from '../translations';
import { buildRescueStatusOption, RescueStatusData } from '../modules/charts/rescueStatusOption';

interface RescueStatusChartProps {
  data: RescueStatusData;
  lang?: Language;
}

const RescueStatusChart: React.FC<RescueStatusChartProps> = ({ data: chartData, lang }) => {
  const resolvedLang: Language = lang ?? 'en';
  const option = useMemo(() => buildRescueStatusOption(chartData, resolvedLang), [chartData, resolvedLang]);

  return (
    <div className="w-full h-[240px] flex items-center justify-center">
      <ReactECharts option={option} notMerge lazyUpdate style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default RescueStatusChart;
