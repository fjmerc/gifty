import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import styles from '../css/filters/DateRangeFilter.module.css';

const DateRangeFilter = ({ dateRange, onDateRangeChange }) => {
  const [startDate, setStartDate] = useState(dateRange.startDate);
  const [endDate, setEndDate] = useState(dateRange.endDate);
  const [tempStartDate, setTempStartDate] = useState(dateRange.startDate);
  const [tempEndDate, setTempEndDate] = useState(dateRange.endDate);

  // Predefined date range options
  const predefinedRanges = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'This year', days: 365 }
  ];

  const handleApplyFilter = () => {
    // Update the parent component with new date range
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
    onDateRangeChange({
      startDate: tempStartDate,
      endDate: tempEndDate
    });
  };

  const handleQuickRangeSelect = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    setTempStartDate(start);
    setTempEndDate(end);
    
    // Apply the filter immediately for quick selections
    setStartDate(start);
    setEndDate(end);
    onDateRangeChange({
      startDate: start,
      endDate: end
    });
  };

  const isDateRangeValid = tempStartDate <= tempEndDate;

  return (
    <div className={styles.dateRangeFilter}>
      <h5 className={styles.filterTitle}>Date Range</h5>
      
      <div className={`row ${styles.dateInputRow}`}>
        <div className="col-md-5">
          <div>
            <label htmlFor="date-range-from" className={`form-label ${styles.dateLabel}`}>From</label>
            <DatePicker
              id="date-range-from"
              selected={tempStartDate}
              onChange={date => setTempStartDate(date)}
              selectsStart
              startDate={tempStartDate}
              endDate={tempEndDate}
              maxDate={tempEndDate}
              className={`form-control ${styles.datePicker}`}
              dateFormat="MMM d, yyyy"
            />
          </div>
        </div>
        
        <div className="col-md-5">
          <div>
            <label htmlFor="date-range-to" className={`form-label ${styles.dateLabel}`}>To</label>
            <DatePicker
              id="date-range-to"
              selected={tempEndDate}
              onChange={date => setTempEndDate(date)}
              selectsEnd
              startDate={tempStartDate}
              endDate={tempEndDate}
              minDate={tempStartDate}
              maxDate={new Date()}
              className={`form-control ${styles.datePicker}`}
              dateFormat="MMM d, yyyy"
            />
          </div>
        </div>
        
        <div className={`col-md-2 ${styles.applyButtonCol}`}>
          <button type="button"
            onClick={handleApplyFilter}
            disabled={!isDateRangeValid}
            className={`btn btn-primary ${styles.applyButton}`}
          >
            Apply
          </button>
        </div>
      </div>
      
      <div className={styles.quickSelectRow}>
        <span className={styles.quickSelectLabel}>Quick select:</span>
        {predefinedRanges.map((range, index) => (
          <button type="button"
            key={index}
            className={`btn btn-outline-secondary btn-sm ${styles.quickSelectButton}`}
            onClick={() => handleQuickRangeSelect(range.days)}
          >
            {range.label}
          </button>
        ))}
      </div>
      
      {!isDateRangeValid && (
        <div className={styles.validationError}>
          Start date must be before or equal to end date
        </div>
      )}
      
      <div className={styles.currentFilter}>
        <span className={styles.currentFilterLabel}>Current filter:</span>
        <span className={styles.currentFilterValue}>
          {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};

export default DateRangeFilter;
