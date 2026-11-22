'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';

type AttendanceTrendData = {
  date: string;
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
  totalHours: number;
};

type AttendanceChartProps = {
  data: AttendanceTrendData[];
  type?: 'bar' | 'line' | 'combined';
};

export function AttendanceChart({ data, type = 'bar' }: AttendanceChartProps) {
  const chartComponents = {
    bar: (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="hadir" fill="#10b981" name="Hadir" />
        <Bar dataKey="izin" fill="#f59e0b" name="Izin" />
        <Bar dataKey="sakit" fill="#ef4444" name="Sakit" />
        <Bar dataKey="alfa" fill="#6b7280" name="Alfa" />
      </BarChart>
    ),
    line: (
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="totalHours" stroke="#3b82f6" name="Total Jam" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    ),
    combined: (
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip />
        <Legend />
        <Bar yAxisId="left" dataKey="hadir" fill="#10b981" name="Hadir" />
        <Bar yAxisId="left" dataKey="izin" fill="#f59e0b" name="Izin" />
        <Bar yAxisId="left" dataKey="sakit" fill="#ef4444" name="Sakit" />
        <Bar yAxisId="left" dataKey="alfa" fill="#6b7280" name="Alfa" />
        <Line yAxisId="right" type="monotone" dataKey="totalHours" stroke="#3b82f6" name="Total Jam" strokeWidth={2} dot={{ r: 4 }} />
      </ComposedChart>
    )
  };

  return (
    <ResponsiveContainer width="100%" height={400}>
      {chartComponents[type]}
    </ResponsiveContainer>
  );
}