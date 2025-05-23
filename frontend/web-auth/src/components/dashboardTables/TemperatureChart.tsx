//TemperatureChart.tsx
import React, { useState, useRef, useEffect, JSX } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Download, X, Calendar } from "lucide-react";
import { fetchAndFormatData, getDefaultData, DataItem } from "../../utils/dataAveraging";
import { handleExport } from "../../utils/ExportUtils";

type ExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  chartRef: React.RefObject<HTMLDivElement | null>;
  chartData: DataItem[];
  xKey: string;
  currentOverview: string; // Add this to track current time period
};

type DatePickerProps = {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
};

// Sample data (kept for fallback purposes)
const dataDay: DataItem[] = [
  { day: "Monday", value: 75 },
  { day: "Tuesday", value: 60 },
  { day: "Wednesday", value: 90 },
  { day: "Thursday", value: 50 },
  { day: "Friday", value: 100 },
  { day: "Saturday", value: 70 },
  { day: "Sunday", value: 85 },
];

const dataWeek: DataItem[] = [
  { week: "Week 1", value: 200 },
  { week: "Week 2", value: 300 },
  { week: "Week 3", value: 250 },
  { week: "Week 4", value: 280 },
];

const dataMonth: DataItem[] = [
  { month: "Jan", value: 75 },
  { month: "Feb", value: 50 },
  { month: "Mar", value: 65 },
  { month: "Apr", value: 90 },
  { month: "May", value: 70 },
  { month: "Jun", value: 80 },
  { month: "Jul", value: 85 },
  { month: "Aug", value: 100 },
  { month: "Sep", value: 70 },
  { month: "Oct", value: 75 },
  { month: "Nov", value: 70 },
  { month: "Dec", value: 85 },
];

const dataYear: DataItem[] = [
  { year: "2021", value: 850 },
  { year: "2022", value: 920 },
  { year: "2023", value: 880 },
  { year: "2024", value: 950 },
  { year: "2025", value: 1050 },
];

// Date Picker
const DatePicker: React.FC<DatePickerProps> = ({
  selectedDate,
  onDateSelect,
  isVisible,
  setIsVisible,
}) => {
  if (!isVisible) return null;

  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const days: JSX.Element[] = [];

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

// Modal
const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  chartRef,
  chartData,
  xKey,
  currentOverview,
}) => {
  const [exportFormat, setExportFormat] = useState<string>("PDF");
  const [timeFrame, setTimeFrame] = useState<string>("current"); // Changed default to "current"
  const [exportType, setExportType] = useState<string>("predefined");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showStartCalendar, setShowStartCalendar] = useState<boolean>(false);
  const [showEndCalendar, setShowEndCalendar] = useState<boolean>(false);
  const [isLoadingExport, setIsLoadingExport] = useState<boolean>(false);

  // Set timeFrame to current overview when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeFrame("current");
    }
  }, [isOpen, currentOverview]);

  const getDataForTimeFrame = async (): Promise<{ data: DataItem[]; key: string }> => {
    if (timeFrame === "current") {
      // Use the current chart data that's already loaded
      return { data: chartData, key: xKey };
    }
    
    // For other time frames, fetch fresh data from the database
    try {
      const { chartData: newData, xKey: newKey } = await fetchAndFormatData(timeFrame, 'temperature');
      return { data: newData, key: newKey };
    } catch (error) {
      console.error("Error fetching data for export:", error);
      // Fallback to sample data if database fetch fails
      switch (timeFrame) {
        case "days":
          return { data: dataDay, key: "day" };
        case "weeks":
          return { data: dataWeek, key: "week" };
        case "months":
          return { data: dataMonth, key: "month" };
        case "years":
          return { data: dataYear, key: "year" };
        default:
          return { data: chartData, key: xKey };
      }
    }
  };

  const handleExportClick = async () => {
    setIsLoadingExport(true);
    
    try {
      const { data: dataToExport, key: keyToUse } = await getDataForTimeFrame();

      const exportConfig = {
        format: exportFormat.toLowerCase(),
        data: dataToExport,
        key: keyToUse,
        title: "Temperature",
        dateRange: exportType === "custom" ? { from: startDate, to: endDate } : null,
      };

      console.log("Exporting:", exportConfig);

      // Determine the correct timeFrame for the export utility
      let exportTimeFrame = timeFrame;
      if (timeFrame === "current") {
        exportTimeFrame = currentOverview;
      }

      await handleExport(
        exportFormat.toLowerCase(), 
        chartRef.current, 
        dataToExport, 
        keyToUse, 
        "Temperature", 
        exportType === "custom" ? { from: startDate, to: endDate } : null,
        exportTimeFrame
      );
      
      onClose();
    } catch (error) {
      console.error("Export failed:", error);
      // You might want to show an error message to the user here
    } finally {
      setIsLoadingExport(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-96 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-[#356B2C]">Export Options</h3>
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

const TemperatureChart = () => {
  const [overview, setOverview] = useState<string>("days");
  const [chartData, setChartData] = useState<DataItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [xKey, setXKey] = useState<string>("day");

  // Fixed X-axis labels for each time period
  const xAxisLabels = {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    weeks: ["Week 1", "Week 2", "Week 3", "Week 4"],
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { chartData: newData, xKey: newXKey } = await fetchAndFormatData(overview, 'temperature');
        
        // Ensure data matches the fixed X-axis labels
        const formattedData = xAxisLabels[overview as keyof typeof xAxisLabels].map((label) => {
          const matchingData = newData.find(item => item[newXKey] === label);
          return {
            [newXKey]: label,
            value: matchingData ? matchingData.value : 0
          };
        });

        setChartData(formattedData);
        setXKey(newXKey);
      } catch (error) {
        console.error("Error fetching temperature data:", error);
        const { chartData: defaultData, xKey: defaultXKey } = getDefaultData(overview);
        setChartData(defaultData);
        setXKey(defaultXKey);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [overview]);

  return (
    <div className="bg-[#E6F0D3] p-4 rounded-2xl">
      <h2 className="text-[#356B2C] text-lg font-semibold mb-2">Temperature</h2>

      <div className="flex justify-between items-center mb-3">
        <div>
          <label htmlFor="overview" className="block text-xs text-[#356B2C] mb-1">
            View by :
          </label>
          <select
            id="overview"
            className="text-xs border pl-1 py-2 rounded shadow bg-white text-[#356B2C] "
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
                  value: 'Temperature (°C)', 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#356B2C' }
                }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#E6F0D3',
                  border: '1px solid #356B2C',
                  borderRadius: '4px'
                }}
                labelStyle={{ color: '#356B2C' }}
              />
              <Bar 
                dataKey="value" 
                fill="#79A842" 
                radius={[100, 100, 100, 100]} 
                barSize={10}
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
      />
    </div>
  );
};

export default TemperatureChart;