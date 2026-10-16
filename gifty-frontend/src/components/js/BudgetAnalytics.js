import React, { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { formatMoney } from '../../utils/money';
import styles from '../css/BudgetAnalytics.module.css';
import { chartThemeOptions, mergeOptions, seriesColors, useThemeColors } from '../../utils/themeColors';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Each recipient's share of the overall budget, for the chart only. Every
// amount shown is a server figure (limit, unallocated); the percentage is a
// display ratio of two server figures.
const buildAllocations = (recipientBudgets, overallBudget) => {
  const total = overallBudget?.exists && overallBudget.isLimited ? Number(overallBudget.amount) : 0;
  if (!(total > 0)) return [];
  return (recipientBudgets || [])
    .filter((rb) => rb.budget?.exists && rb.limit !== null && rb.limit !== undefined)
    .map((rb) => ({
      id: rb._id,
      name: `${rb.firstName || ''} ${rb.lastName || ''}`.trim(),
      limit: rb.limit,
      percentage: rb.budget.allocationType === 'percentage'
        ? Number(rb.budget.percentageAllocation) || 0
        : (Number(rb.limit) / total) * 100
    }))
    .sort((a, b) => b.percentage - a.percentage);
};

const BudgetAnalytics = ({ analytics, recipientBudgets, overallBudget }) => {
  const currency = analytics?.currency || overallBudget?.currency || 'USD';
  const colors = useThemeColors();

  const allocations = useMemo(
    () => buildAllocations(recipientBudgets, overallBudget),
    [recipientBudgets, overallBudget]
  );
  const allocatedPercent = allocations.reduce((sum, a) => sum + a.percentage, 0);
  const unallocatedPercent = Math.max(0, 100 - allocatedPercent);

  const chartData = {
    labels: allocations.map((a) => `${a.name} (${a.percentage.toFixed(1)}%)`),
    datasets: [{
      data: allocations.map((a) => a.percentage),
      backgroundColor: seriesColors(colors, allocations.length),
      // A gap in the surface colour between slices
      borderColor: colors.surface,
      borderWidth: allocations.length > 1 ? 2 : 0 // no seam across a lone slice
    }]
  };

  if (allocations.length > 0 && unallocatedPercent > 0) {
    chartData.labels.push(`Unallocated (${unallocatedPercent.toFixed(1)}%)`);
    chartData.datasets[0].data.push(unallocatedPercent);
    chartData.datasets[0].backgroundColor.push(colors.border);
  }

  const chartOptions = mergeOptions(chartThemeOptions(colors), {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        // Under the pie: beside it, a phone-width card cut names to 'Maria C'
        position: 'bottom',
        labels: { padding: 20, font: { size: 12 } }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const allocation = allocations[context.dataIndex];
            const amount = allocation ? allocation.limit : overallBudget?.unallocated;
            return [
              `Percentage: ${(context.parsed || 0).toFixed(1)}%`,
              `Amount: ${formatMoney(amount, currency)}`
            ];
          }
        }
      }
    }
  });

  const monthlySpending = Array.isArray(analytics?.monthlySpending) && analytics.monthlySpending.length === 12
    ? analytics.monthlySpending
    : Array(12).fill(0);
  const maxSpending = Math.max(0, ...monthlySpending.map(Number).filter(Number.isFinite));
  const barHeight = (amount) => {
    const value = Number(amount);
    if (!(maxSpending > 0) || !Number.isFinite(value)) return 0;
    return Math.min(Math.max((value / maxSpending) * 100, 0), 100);
  };

  const statuses = analytics?.budgetStatuses || {};

  return (
    <div className={styles.analyticsContainer}>
      <h2>Budget Analytics</h2>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <h3>Budget Status</h3>
          <div className={styles.statusGrid}>
            <div className={`${styles.status} ${styles.normal}`}>
              <span>Within</span>
              <span>{statuses.within || 0}</span>
            </div>
            <div className={`${styles.status} ${styles.warning}`}>
              <span>Warning</span>
              <span>{statuses.warning || 0}</span>
            </div>
            <div className={`${styles.status} ${styles.critical}`}>
              <span>Over</span>
              <span>{statuses.over || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.monthlySpending}>
        <h3>Monthly Spending</h3>
        <div className={styles.monthlyChart}>
          {monthlySpending.map((amount, index) => (
            <div key={index} className={styles.monthBar} title={`${MONTHS[index]}: ${formatMoney(amount, currency)}`}>
              <div className={styles.bar} style={{ height: `${barHeight(amount)}%` }} />
              <span className={styles.monthLabel}>{MONTHS[index].slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.budgetAllocation}>
        <h3>Budget Allocation</h3>
        {allocations.length > 0 ? (
          <div className={styles.pieChartContainer}>
            <div className={styles.pieChart}>
              <Pie data={chartData} options={chartOptions} />
            </div>
          </div>
        ) : (
          <p>Set a limited overall budget and recipient budgets to see the allocation.</p>
        )}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span>Recipient budgets:</span>
          <span>{analytics?.totalBudgets || 0}</span>
        </div>
        <div className={styles.summaryItem}>
          <span>Spent:</span>
          <span>{formatMoney(analytics?.totalSpent ?? 0, currency)}</span>
        </div>
      </div>
    </div>
  );
};

export default BudgetAnalytics;
