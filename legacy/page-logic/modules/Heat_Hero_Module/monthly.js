const scenarios = {{ scenarios.value }};

const months = [
  { key: 'jan', label: 'Jan' },
  { key: 'feb', label: 'Feb' },
  { key: 'mar', label: 'Mar' },
  { key: 'apr', label: 'Apr' },
  { key: 'may', label: 'May' },
  { key: 'jun', label: 'Jun' },
  { key: 'jul', label: 'Jul' },
  { key: 'aug', label: 'Aug' },
  { key: 'sep', label: 'Sep' },
  { key: 'oct', label: 'Oct' },
  { key: 'nov', label: 'Nov' },
  { key: 'dec', label: 'Dec' }
];

// Map over every scenario and flatten into a single list of monthly costs
return scenarios.flatMap(row => {
  return months.flatMap(m => [
    {
      variation_id: row.variation_id,
      month: m.label,
      cost: parseFloat(row[`${m.key}_electric_usd`]) || 0,
      type: 'Electric'
    },
    {
      variation_id: row.variation_id,
      month: m.label,
      cost: parseFloat(row[`${m.key}_gas_usd`]) || 0,
      type: 'Gas'
    }
  ]);
});