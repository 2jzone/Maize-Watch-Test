import React, { useState, useRef, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Download, X, Calendar } from "lucide-react";

// Types
interface DataItem {
  [key: string]: string | number;
}

interface ThingSpeakEntry {
  created_at: string;
  entry_id: number;
  field5: string;
}

interface ThingSpeakResponse {
  feeds: ThingSpeakEntry[];
  channel: {
    id: number;
    name: string;
    last_entry_id: number;
  };
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartRef: React.RefObject<HTMLDivElement | null>;
  chartData: DataItem[];
  xKey: string;
  currentOverview: string;
  dateRange: string;
}

interface DatePickerProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
}

// API Configuration
const THINGSPEAK_CONFIG = {
  channelId: '2965485',
  apiKey: 'EQ3MYH5XBDSB6K2A',
  field: '5',
  baseUrl: 'https://api.thingspeak.com/channels'
};

// Utility Functions
const getTimescaleForPeriod = (period: string): number => {
  switch (period) {
    case 'days': return 86400; // 24 hours in seconds
    case 'weeks': return 604800; // 7 days in seconds
    case 'months': return 2592000; // 30 days in seconds
    default: return 86400;
  }
};

const fetchThingSpeakData = async (period: string): Promise<ThingSpeakResponse> => {
  const timescale = getTimescaleForPeriod(period);
  const url = `${THINGSPEAK_CONFIG.baseUrl}/${THINGSPEAK_CONFIG.channelId}/fields/${THINGSPEAK_CONFIG.field}.json?api_key=${THINGSPEAK_CONFIG.apiKey}&timescale=${timescale}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Fetched ${period} data:`, data); // Debug log
    
    return data;
  } catch (error) {
    console.error(`Error fetching ${period} data:`, error);
    throw error;
  }
};

const getWeekRange = (date: Date): { start: Date; end: Date } => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day;
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
};

const getMonthRange = (date: Date): { start: Date; end: Date } => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const formatDateRange = (start: Date, end: Date): string => {
  const options: Intl.DateTimeFormatOptions = { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    timeZone: 'Asia/Manila'
  };
  return `${start.toLocaleDateString('en-PH', options)} - ${end.toLocaleDateString('en-PH', options)}`;
};

const convertToPhilippineTime = (utcDateString: string): Date => {
  const utcDate = new Date(utcDateString);
  // Philippines is UTC+8
  const philippineTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
  return philippineTime;
};

const getCurrentPhilippineTime = (): Date => {
  const now = new Date();
  // Convert current time to Philippine time (UTC+8)
  const philippineTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return philippineTime;
};

const getDayOfWeekName = (dayIndex: number): string => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[dayIndex];
};

const processLightIntensityData = (response: ThingSpeakResponse, period: string): { chartData: DataItem[]; xKey: string; dateRange: string } => {
  if (!response.feeds || response.feeds.length === 0) {
    return getDefaultData(period);
  }

  // Get the latest date from the data and convert to Philippine time
  const latestEntry = response.feeds[response.feeds.length - 1];
  const latestDate = convertToPhilippineTime(latestEntry.created_at);
  
  let chartData: DataItem[] = [];
  let xKey = '';
  let dateRange = '';

  switch (period) {
    case 'days': {
      // Process daily averages
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayData: { [key: string]: { sum: number; count: number; dates: string[] } } = {};
      
      // Initialize all days
      dayNames.forEach(day => {
        dayData[day] = { sum: 0, count: 0, dates: [] };
      });
      
      // Process the averaged data
      response.feeds.forEach(entry => {
        if (entry.field5) {
          const entryDate = convertToPhilippineTime(entry.created_at);
          const dayName = dayNames[entryDate.getDay()];
          const value = parseFloat(entry.field5);
          const dateStr = entryDate.toLocaleDateString('en-PH');
          
          if (!isNaN(value)) {
            dayData[dayName].sum += value;
            dayData[dayName].count += 1;
            if (!dayData[dayName].dates.includes(dateStr)) {
              dayData[dayName].dates.push(dateStr);
            }
          }
        }
      });
      
      // Create chart data with averages
      chartData = dayNames.map(day => ({
        day,
        value: dayData[day].count > 0 ? Math.round(dayData[day].sum / dayData[day].count * 10) / 10 : 0,
        dataPoints: dayData[day].count,
        dates: dayData[day].dates.join(', ')
      }));
      
      // Set date range for the last 7 days
      const endDate = new Date(latestDate);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      dateRange = formatDateRange(startDate, endDate);
      xKey = 'day';
      break;
    }
    
    case 'weeks': {
      // Process weekly averages
      const weeksData: { [key: string]: { sum: number; count: number } } = {};
      
      // Get last 4 weeks from latest date
      for (let i = 3; i >= 0; i--) {
        const weekDate = new Date(latestDate);
        weekDate.setDate(weekDate.getDate() - (i * 7));
        const { start, end } = getWeekRange(weekDate);
        const weekLabel = `Week ${4 - i}`;
        weeksData[weekLabel] = { sum: 0, count: 0 };
        
        response.feeds.forEach(entry => {
          const entryDate = convertToPhilippineTime(entry.created_at);
          if (entryDate >= start && entryDate <= end && entry.field5) {
            const value = parseFloat(entry.field5);
            if (!isNaN(value)) {
              weeksData[weekLabel].sum += value;
              weeksData[weekLabel].count += 1;
            }
          }
        });
      }
      
      const firstWeekDate = new Date(latestDate);
      firstWeekDate.setDate(firstWeekDate.getDate() - 21);
      const { start } = getWeekRange(firstWeekDate);
      const { end } = getWeekRange(latestDate);
      dateRange = formatDateRange(start, end);
      
      chartData = Object.keys(weeksData).map(week => ({
        week,
        value: weeksData[week].count > 0 ? Math.round(weeksData[week].sum / weeksData[week].count * 10) / 10 : 0
      }));
      xKey = 'week';
      break;
    }
    
    case 'months': {
      // Process monthly averages
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthsData: { [key: string]: { sum: number; count: number } } = {};
      
      // Get last 12 months from latest date
      for (let i = 11; i >= 0; i--) {
        const monthDate = new Date(latestDate);
        monthDate.setMonth(monthDate.getMonth() - i);
        const { start, end } = getMonthRange(monthDate);
        const monthLabel = monthNames[monthDate.getMonth()];
        monthsData[monthLabel] = { sum: 0, count: 0 };
        
        response.feeds.forEach(entry => {
          const entryDate = convertToPhilippineTime(entry.created_at);
          if (entryDate >= start && entryDate <= end && entry.field5) {
            const value = parseFloat(entry.field5);
            if (!isNaN(value)) {
              monthsData[monthLabel].sum += value;
              monthsData[monthLabel].count += 1;
            }
          }
        });
      }
      
      const firstMonthDate = new Date(latestDate);
      firstMonthDate.setMonth(firstMonthDate.getMonth() - 11);
      const { start } = getMonthRange(firstMonthDate);
      const { end } = getMonthRange(latestDate);
      dateRange = formatDateRange(start, end);
      
      chartData = monthNames.map(month => ({
        month,
        value: monthsData[month].count > 0 ? Math.round(monthsData[month].sum / monthsData[month].count * 10) / 10 : 0
      }));
      xKey = 'month';
      break;
    }
  }

  return { chartData, xKey, dateRange };
};

const getDefaultData = (period: string): { chartData: DataItem[]; xKey: string; dateRange: string } => {
  const today = getCurrentPhilippineTime();
  
  switch (period) {
    case 'days': {
      // Use May 25-31, 2025 as default range
      const startDate = new Date(2025, 4, 25);
      const endDate = new Date(2025, 4, 31);
      return {
        chartData: [
          { day: "Sunday", value: 25.2, dataPoints: 12, dates: "May 25, 2025" },
          { day: "Monday", value: 26.8, dataPoints: 15, dates: "May 26, 2025" },
          { day: "Tuesday", value: 24.5, dataPoints: 18, dates: "May 27, 2025" },
          { day: "Wednesday", value: 27.1, dataPoints: 14, dates: "May 28, 2025" },
          { day: "Thursday", value: 25.9, dataPoints: 16, dates: "May 29, 2025" },
          { day: "Friday", value: 26.3, dataPoints: 13, dates: "May 30, 2025" },
          { day: "Saturday", value: 25.7, dataPoints: 17, dates: "May 31, 2025" },
        ],
        xKey: 'day',
        dateRange: formatDateRange(startDate, endDate)
      };
    }
    case 'weeks': {
      const firstWeekDate = new Date(today);
      firstWeekDate.setDate(firstWeekDate.getDate() - 21);
      const { start } = getWeekRange(firstWeekDate);
      const { end } = getWeekRange(today);
      return {
        chartData: [
          { week: "Week 1", value: 24.8 },
          { week: "Week 2", value: 26.2 },
          { week: "Week 3", value: 25.5 },
          { week: "Week 4", value: 26.7 },
        ],
        xKey: 'week',
        dateRange: formatDateRange(start, end)
      };
    }
    case 'months': {
      const firstMonthDate = new Date(today);
      firstMonthDate.setMonth(firstMonthDate.getMonth() - 11);
      const { start } = getMonthRange(firstMonthDate);
      const { end } = getMonthRange(today);
      return {
        chartData: [
          { month: "Jan", value: 23.5 }, { month: "Feb", value: 24.1 }, { month: "Mar", value: 25.8 },
          { month: "Apr", value: 27.2 }, { month: "May", value: 28.9 }, { month: "Jun", value: 30.1 },
          { month: "Jul", value: 31.5 }, { month: "Aug", value: 30.8 }, { month: "Sep", value: 29.2 },
          { month: "Oct", value: 27.6 }, { month: "Nov", value: 25.3 }, { month: "Dec", value: 24.0 },
        ],
        xKey: 'month',
        dateRange: formatDateRange(start, end)
      };
    }
    default:
      return { chartData: [], xKey: '', dateRange: '' };
  }
};

// Date Picker Component
const DatePicker: React.FC<DatePickerProps> = ({
  selectedDate,
  onDateSelect,
  isVisible,
  setIsVisible,
}) => {
  if (!isVisible) return null;

  const currentDate = getCurrentPhilippineTime();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const days: React.ReactElement[] = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    days.push(
      <button
        key={i}
        onClick={() => {
          onDateSelect(dateStr);
          setIsVisible(false);
        }}
        className={`h-8 w-8 rounded-full hover:bg-[#79A842] hover:text-white ${
          dateStr === selectedDate ? "bg-[#356B2C] text-white" : ""
        }`}
      >
        {i}
      </button>
    );
  }

  return (
    <div className="absolute z-10 mt-1 p-2 bg-white border border-[#356B2C] rounded-md shadow-lg">
      <div className="text-center font-bold mb-2 text-[#356B2C]">
        {new Date(year, month).toLocaleString("default", { month: "long" })} {year}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div key={day} className="font-semibold text-[#356B2C]">
            {day}
          </div>
        ))}
        {days}
      </div>
    </div>
  );
};

// Export Modal Component
const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  chartRef,
  chartData,
  xKey,
  currentOverview,
  dateRange,
}) => {
  const [exportFormat, setExportFormat] = useState<string>("PDF");
  const [timeFrame, setTimeFrame] = useState<string>("current");
  const [exportType, setExportType] = useState<string>("predefined");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showStartCalendar, setShowStartCalendar] = useState<boolean>(false);
  const [showEndCalendar, setShowEndCalendar] = useState<boolean>(false);
  const [isLoadingExport, setIsLoadingExport] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setTimeFrame("current");
    }
  }, [isOpen]);

  const handleExportClick = async () => {
    setIsLoadingExport(true);
    
    try {
      // Create export data
      const exportData = {
        format: exportFormat.toLowerCase(),
        data: chartData,
        key: xKey,
        title: "Light Intensity Data",
        dateRange: exportType === "custom" ? { from: startDate, to: endDate } : dateRange,
        timeFrame: timeFrame === "current" ? currentOverview : timeFrame
      };

      // Simulate export process
      console.log("Exporting light intensity data:", exportData);
      
      // For demonstration, create a simple CSV export
      if (exportFormat === "CSV") {
        const csvContent = [
          [xKey.charAt(0).toUpperCase() + xKey.slice(1), "Light Intensity (LUX)"],
          ...chartData.map(item => [item[xKey], item.value])
        ].map(row => row.join(",")).join("\n");
        
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lightintensity-data-${currentOverview}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      
      onClose();
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsLoadingExport(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-96 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-[#356B2C]">Export Light Intensity Data</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-[#356B2C] mb-1">Export Format</label>
          <div className="flex gap-2">
            {["PDF", "CSV", "SVG"].map((format) => (
              <button
                key={format}
                onClick={() => setExportFormat(format)}
                className={`px-3 py-1 rounded-md text-sm flex-1 ${exportFormat === format
                    ? "bg-[#79A842] text-white"
                    : "bg-gray-100 text-[#356B2C] hover:bg-gray-200"
                  }`}
              >
                {format}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-[#356B2C] mb-1">Export Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setExportType("predefined")}
              className={`px-3 py-1 rounded-md text-sm flex-1 ${exportType === "predefined"
                  ? "bg-[#79A842] text-white"
                  : "bg-gray-100 text-[#356B2C] hover:bg-gray-200"
                }`}
            >
              Predefined Period
            </button>
            <button
              onClick={() => setExportType("custom")}
              className={`px-3 py-1 rounded-md text-sm flex-1 ${exportType === "custom"
                  ? "bg-[#79A842] text-white"
                  : "bg-gray-100 text-[#356B2C] hover:bg-gray-200"
                }`}
            >
              Custom Range
            </button>
          </div>
        </div>

        {exportType === "predefined" ? (
          <div className="mb-4">
            <label className="block text-sm text-[#356B2C] mb-1">Time Frame</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "current", label: `Current (${currentOverview})` },
                { value: "days", label: "Days" },
                { value: "weeks", label: "Weeks" },
                { value: "months", label: "Months" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTimeFrame(option.value)}
                  className={`px-3 py-1 rounded-md text-sm ${timeFrame === option.value
                      ? "bg-[#79A842] text-white"
                      : "bg-gray-100 text-[#356B2C] hover:bg-gray-200"
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            {["Start", "End"].map((label, i) => {
              const isStart = label === "Start";
              const value = isStart ? startDate : endDate;
              const setValue = isStart ? setStartDate : setEndDate;
              const toggle = isStart ? showStartCalendar : showEndCalendar;
              const setToggle = isStart ? setShowStartCalendar : setShowEndCalendar;
              return (
                <div key={label} className="mb-2">
                  <label className="block text-sm text-[#356B2C] mb-1">{label} Date</label>
                  <div className="relative">
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="w-full p-2 border border-[#356B2C] rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setToggle(!toggle)}
                        className="absolute right-2 text-[#356B2C]"
                      >
                        <Calendar size={16} />
                      </button>
                    </div>
                    <DatePicker
                      selectedDate={value}
                      onDateSelect={setValue}
                      isVisible={toggle}
                      setIsVisible={setToggle}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mb-4 p-3 bg-gray-50 rounded text-sm text-[#356B2C]">
          <strong>Current Range (Philippine Time):</strong> {dateRange}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#356B2C] rounded-md text-[#356B2C] text-sm hover:bg-gray-50"
            disabled={isLoadingExport}
          >
            Cancel
          </button>
          <button
            onClick={handleExportClick}
            className="px-4 py-2 bg-[#356B2C] rounded-md text-white text-sm hover:bg-[#2a5823] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={isLoadingExport}
          >
            {isLoadingExport ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Exporting...
              </>
            ) : (
              "Export"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#E6F0D3] border border-[#356B2C] rounded p-3 shadow-lg">
        <p className="text-[#356B2C] font-semibold">{`${label}`}</p>
        <p className="text-[#356B2C]">{`Light Intensity: ${payload[0].value} LUX`}</p>
        {data.dataPoints !== undefined && (
          <p className="text-[#356B2C] text-xs">{`Data Points: ${data.dataPoints}`}</p>
        )}
        {data.dates && (
          <p className="text-[#356B2C] text-xs">{`Dates: ${data.dates}`}</p>
        )}
      </div>
    );
  }
  return null;
};

// Main Component
const LightIntensityChart = () => {
  const [overview, setOverview] = useState<string>("days");
  const [chartData, setChartData] = useState<DataItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<string>("");
  const chartRef = useRef<HTMLDivElement>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [xKey, setXKey] = useState<string>("day");

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetchThingSpeakData(overview);
        const { chartData: newData, xKey: newXKey, dateRange: newDateRange } = processLightIntensityData(response, overview);
        
        setChartData(newData);
        setXKey(newXKey);
        setDateRange(newDateRange);
      } catch (error) {
        console.error("Error fetching light intensity data:", error);
        setError("Failed to fetch live data. Showing sample data.");
        
        // Use default data as fallback
        const { chartData: defaultData, xKey: defaultXKey, dateRange: defaultDateRange } = getDefaultData(overview);
        setChartData(defaultData);
        setXKey(defaultXKey);
        setDateRange(defaultDateRange);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [overview]);

  return (
    <div className="bg-[#E6F0D3] p-4 rounded-2xl">
      <h2 className="text-[#356B2C] text-lg font-semibold mb-2">Light Intensity</h2>
      
      {error && (
        <div className="mb-3 p-2 bg-yellow-100 border border-yellow-400 rounded text-yellow-800 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <div>
          <label htmlFor="overview" className="block text-xs text-[#356B2C] mb-1">
            View by:
          </label>
          <select
            id="overview"
            className="text-xs border pl-1 py-2 rounded shadow bg-white text-[#356B2C]"
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
          >
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
            <option value="months">Months</option>
          </select>
        </div>

        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-1 text-[#356B2C] text-xs hover:bg-[#d6e3bc] px-2 py-1 rounded transition-colors"
        >
          <Download size={13} />
          Export
        </button>
      </div>

      {dateRange && (
        <div className="mb-3 text-xs text-[#356B2C] bg-white px-2 py-1 rounded border">
          <strong>Date Range:</strong> {dateRange}
        </div>
      )}

      <div
        ref={chartRef}
        className="bg-white py-9 pr-8 rounded-xl border border-[#356B2C]"
        style={{ height: 420 }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#356B2C]"></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData}>
              <XAxis 
                dataKey={xKey} 
                tick={{ fontSize: 12, fill: '#356B2C' }}
                axisLine={{ stroke: '#356B2C' }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: '#356B2C' }}
                axisLine={{ stroke: '#356B2C' }}
                label={{ 
                  value: 'Light Intensity (LUX)', 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#356B2C' }
                }}
              />
              <Tooltip 
                content={<CustomTooltip />}
              />
              <Bar 
                dataKey="value" 
                fill="#79A842" 
                radius={[4, 4, 0, 0]} 
                barSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        chartRef={chartRef}
        chartData={chartData}
        xKey={xKey}
        currentOverview={overview}
        dateRange={dateRange}
      />
    </div>
  );
};

export default LightIntensityChart;