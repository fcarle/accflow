'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
// import dynamic from 'next/dynamic'; // Keep if MarkerClusterGroup is still used by some other part, otherwise remove
import { supabase } from '@/lib/supabase';
// import 'leaflet/dist/leaflet.css'; // Remove if no Leaflet components remain
// import 'leaflet-draw/dist/leaflet.draw.css'; // Remove if no leaflet-draw components remain
// Leaflet-related imports to be removed if MapContainer and EditControl are fully gone:
// import { MapContainer, TileLayer, Marker, Popup, FeatureGroup, useMapEvents } from 'react-leaflet';
// import L, { LeafletEvent, GeoJSON } from 'leaflet'; 
// import { EditControl } from 'react-leaflet-draw';
// import { MarkerClusterGroup } from dynamic import

// Keep GeoJSON if saved searches of type 'map_area' are still being processed for filtering in list view
// import { GeoJSON } from 'leaflet'; // Removed as SavedSearch types are being removed
// import booleanPointInPolygon from '@turf/boolean-point-in-polygon'; // Removed
// import distance from '@turf/distance'; // Removed
// import { point as turfPoint } from '@turf/helpers'; // Removed

// Remove dynamic import for MarkerClusterGroup if no map markers are displayed anymore
// const MarkerClusterGroup = dynamic(() => import('react-leaflet-cluster'), {
//   ssr: false,
// });

// Remove L.Icon.Default fix if Leaflet is not used
// delete (L.Icon.Default.prototype as any)._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
//   iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
//   shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
// });

type Tab = 'List' | 'Marketing Growth';

interface CompanyData {
  company_name: string | null;
  company_number: string;
  accounts_next_due_date: string | null;
  returns_next_due_date: string | null;
  reg_address_address_line1?: string | null;
  reg_address_address_line2?: string | null;
  reg_address_post_town?: string | null;
  reg_address_county?: string | null;
  reg_address_post_code?: string | null;
  latitude?: number;
  longitude?: number;
}

// Removed SavedSearchDefinition interface
// Removed SavedSearch interface

const ITEMS_PER_PAGE = 20;

export default function NewLeadsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('List');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [leadCompanies, setLeadCompanies] = useState<CompanyData[]>([]);
  const getInitialEndDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    return date.toISOString().split('T')[0];
  };
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(getInitialEndDate());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalLeads, setTotalLeads] = useState<number>(0);

  const [specificAccountsDueStartDate, setSpecificAccountsDueStartDate] = useState<string>('');
  const [specificAccountsDueEndDate, setSpecificAccountsDueEndDate] = useState<string>('');
  const [specificConfirmationStatementStartDate, setSpecificConfirmationStatementStartDate] = useState<string>('');
  const [specificConfirmationStatementEndDate, setSpecificConfirmationStatementEndDate] = useState<string>('');

  // const geocodeCache = useRef<Record<string, { latitude: number; longitude: number }>>({}); // Removed as it's no longer used

  // const [customSearchName, setCustomSearchName] = useState<string>(''); // Removed
  // const [customAddress, setCustomAddress] = useState<string>(''); // Removed
  // const [customRadius, setCustomRadius] = useState<number>(5); // Removed
  
  // const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]); // Removed
  // const [loadingSavedSearches, setLoadingSavedSearches] = useState<boolean>(false); // Removed
  // const [errorSavedSearches, setErrorSavedSearches] = useState<string | null>(null); // Removed

  // const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<string | null>(null); // Removed
  const filteredLeadsRef = useRef<CompanyData[]>([]);

  const [clientCompanyNumbers, setClientCompanyNumbers] = useState<Set<string>>(new Set());
  const [loadingClientNumbers, setLoadingClientNumbers] = useState<boolean>(true);
  const [errorClientNumbers, setErrorClientNumbers] = useState<string | null>(null);

  const [cityFilter, setCityFilter] = useState<string>('');
  const [postcodeFilter, setPostcodeFilter] = useState<string>('');
  const [postTownOptions, setPostTownOptions] = useState<string[]>([]);

  // State for Marketing Growth Tab
  const [currentCityInput, setCurrentCityInput] = useState<string>('');
  const [selectedMarketingCities, setSelectedMarketingCities] = useState<string[]>([]);
  const [marketingLeadCount, setMarketingLeadCount] = useState<number>(0);
  const [marketingLoading, setMarketingLoading] = useState<boolean>(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);
  const [marketingProgressMessage, setMarketingProgressMessage] = useState<string>('');

  // State for "Take Action" forms
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [directMailQuantity, setDirectMailQuantity] = useState<number>(1);
  const DIRECT_MAIL_COST_PER_LETTER = 1.5;
  const [googleSearchSelected, setGoogleSearchSelected] = useState<boolean>(false);
  const [facebookInstagramAdsSelected, setFacebookInstagramAdsSelected] = useState<boolean>(false);
  const [linkedinAdsSelected, setLinkedInAdsSelected] = useState<boolean>(false);
  const [emailCampaignSelected, setEmailCampaignSelected] = useState<boolean>(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Cost constants for plans (no longer directly used for planDetails.cost, but kept for potential reference or future features)
  // const STARTER_PLAN_COST = 400; 
  // const PRO_PLAN_COST = 1000;
  // const ENTERPRISE_PLAN_COST = 2500;

  // Define planDetails at component scope
  const planDetails: {[key: string]: {name: string, cost: string, services: string[], color: string, description: string, tier: number}} = {
    starter: {
        name: "Starter Plan",
        cost: "350-500", // Updated cost
        services: ["Email Campaign", "Google Search Ads"],
        color: "indigo",
        description: "Ideal for getting started with essential digital outreach.",
        tier: 1
    },
    pro: {
        name: "Pro Plan",
        cost: "799-1000", // Updated cost
        services: ["Email Campaign", "Google Search Ads", "Facebook & Instagram Ads"],
        color: "green",
        description: "Expand your reach with social media advertising.",
        tier: 2
    },
    enterprise: {
        name: "Enterprise Plan",
        cost: "2000+", // Updated cost
        services: ["Email Campaign", "Google Search Ads", "Facebook & Instagram Ads", "LinkedIn Ads"],
        color: "purple",
        description: "Comprehensive coverage for maximum professional outreach.",
        tier: 3
    }
  };

  const fetchClientCompanyNumbers = useCallback(async () => {
    setLoadingClientNumbers(true);
    setErrorClientNumbers(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setClientCompanyNumbers(new Set());
        return;
      }
      const { data, error: dbError } = await supabase
        .from('clients')
        .select('company_number')
        .eq('created_by', user.id)
        .not('company_number', 'is', null);
      if (dbError) throw dbError;
      const numbers = new Set(data?.map(client => client.company_number).filter(Boolean) || []);
      setClientCompanyNumbers(numbers);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setErrorClientNumbers("Failed to load client list for filtering: " + errorMessage);
      setClientCompanyNumbers(new Set());
    } finally {
      setLoadingClientNumbers(false);
    }
  }, []);

  useEffect(() => {
    // fetchSavedSearches(); // Removed call
    fetchClientCompanyNumbers();

    const fetchPostTowns = async () => { // Renamed for clarity if it fetches counties
      try {
        const { data, error } = await supabase
          .from('companies_house_data')
          .select('reg_address_county'); // Explicitly selecting only reg_address_county

        if (error) {
          console.error('Error fetching distinct counties:', error); // Updated log message
          // Optionally set an error state here
          return;
        }

        if (data) {
          const uniqueCounties = Array.from(
            new Set(
              data
                .map(item => item.reg_address_county)
                .filter(county => county !== null && county.trim() !== '')
                .map(county => county!.toUpperCase()) // Standardize to uppercase
            )
          ).sort();
          setPostTownOptions(uniqueCounties); // This state setter might need renaming if it's for counties
        }
      } catch (e) {
        console.error('Error processing distinct counties:', e); // Updated log message
        // Optionally set an error state here
      }
    };

    fetchPostTowns();
  }, [fetchClientCompanyNumbers]);

  useEffect(() => {
    // Determine recommended plan based on selected services
    let recommendedPlanKey: string | null = null;
    if (linkedinAdsSelected) {
      recommendedPlanKey = 'enterprise';
    } else if (facebookInstagramAdsSelected) {
      recommendedPlanKey = 'pro';
    } else if (emailCampaignSelected || googleSearchSelected) {
      recommendedPlanKey = 'starter';
    }
    setSelectedPlan(recommendedPlanKey);
  }, [emailCampaignSelected, googleSearchSelected, facebookInstagramAdsSelected, linkedinAdsSelected]);

  const fetchListData = useCallback(async () => {
    if (loadingClientNumbers) return;
      if (!startDate || !endDate) {
        setLeadCompanies([]);
        setTotalLeads(0);
        filteredLeadsRef.current = [];
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const lowerBoundDateQuery = startDate;
      const upperBoundDateQuery = endDate;
      const page = currentPage - 1;
      const trimmedCityFilter = cityFilter.trim();
      const trimmedPostcodeFilter = postcodeFilter.trim();
      
      try {
        let queryBuilder = supabase
          .from('companies_house_data')
          .select('company_number, company_name, accounts_next_due_date, returns_next_due_date, company_status, reg_address_address_line1, reg_address_address_line2, reg_address_post_town, reg_address_county, reg_address_post_code', { count: 'exact' })
          .or(`and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`);

        if (specificAccountsDueStartDate && specificAccountsDueEndDate) {
          queryBuilder = queryBuilder
            .gte('accounts_next_due_date', specificAccountsDueStartDate)
            .lte('accounts_next_due_date', specificAccountsDueEndDate);
        }

        if (specificConfirmationStatementStartDate && specificConfirmationStatementEndDate) {
          queryBuilder = queryBuilder
            .gte('returns_next_due_date', specificConfirmationStatementStartDate)
            .lte('returns_next_due_date', specificConfirmationStatementEndDate);
        }
        
        queryBuilder = queryBuilder.filter('company_status', 'eq', 'Active');

        if (trimmedCityFilter) {
          queryBuilder = queryBuilder.ilike('reg_address_county', `%${trimmedCityFilter}%`);
        }

        if (trimmedPostcodeFilter) {
          queryBuilder = queryBuilder.ilike('reg_address_post_code', `%${trimmedPostcodeFilter.replace(/\s+/g, '')}%`);
        }
        
        queryBuilder = queryBuilder.range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
        
        const { data, error: dbError, count } = await queryBuilder;
        
        let potentialLeads: CompanyData[] = [];
        if (dbError) {
          console.error("Supabase dbError object (debug):", dbError);
          throw dbError;
        }
        if (data) {
          potentialLeads = data.filter(company => !clientCompanyNumbers.has(company.company_number));
        }
        const totalPotentialLeads = count ?? 0;

        filteredLeadsRef.current = potentialLeads; 
        setLeadCompanies(potentialLeads.slice(0, ITEMS_PER_PAGE)); 
        setTotalLeads(totalPotentialLeads);

      } catch (e: unknown) {
        console.error("Caught error in fetchListData (Vercel debug):", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError("Failed to load leads. " + errorMessage);
      } finally {
        setLoading(false);
      }
  }, [startDate, endDate, currentPage, clientCompanyNumbers, loadingClientNumbers, cityFilter, postcodeFilter, specificAccountsDueStartDate, specificAccountsDueEndDate, specificConfirmationStatementStartDate, specificConfirmationStatementEndDate]);

  const previousDepsRef = useRef({
    startDate: '',
    endDate: '',
    cityFilter: '',
    postcodeFilter: '',
    clientCompanyNumbers: new Set<string>(),
    specificAccountsDueStartDate: '',
    specificAccountsDueEndDate: '',
    specificConfirmationStatementStartDate: '',
    specificConfirmationStatementEndDate: '',
  });

  useEffect(() => {
    const dependenciesChanged = () => {
        const currentDeps = {
            startDate,
            endDate,
            cityFilter,
            postcodeFilter,
            clientCompanyNumbers,
            specificAccountsDueStartDate,
            specificAccountsDueEndDate,
            specificConfirmationStatementStartDate,
            specificConfirmationStatementEndDate,
        };
        const prev = previousDepsRef.current;
        if (
            prev.startDate !== currentDeps.startDate || 
            prev.endDate !== currentDeps.endDate || 
            prev.cityFilter !== currentDeps.cityFilter || 
            prev.postcodeFilter !== currentDeps.postcodeFilter ||
            prev.clientCompanyNumbers !== currentDeps.clientCompanyNumbers || 
            prev.specificAccountsDueStartDate !== currentDeps.specificAccountsDueStartDate ||
            prev.specificAccountsDueEndDate !== currentDeps.specificAccountsDueEndDate ||
            prev.specificConfirmationStatementStartDate !== currentDeps.specificConfirmationStatementStartDate ||
            prev.specificConfirmationStatementEndDate !== currentDeps.specificConfirmationStatementEndDate
        ) {
            previousDepsRef.current = currentDeps;
            return true;
        }
        return false;
    };

    if (activeTab === 'List') {
        if (dependenciesChanged() || leadCompanies.length === 0 && !loading) {
            fetchListData();
        }
    }
  }, [
    activeTab, 
    startDate, 
    endDate, 
    cityFilter, 
    postcodeFilter,
    clientCompanyNumbers, 
    leadCompanies.length, 
    loading,
    specificAccountsDueStartDate,
    specificAccountsDueEndDate,
    specificConfirmationStatementStartDate,
    specificConfirmationStatementEndDate,
    fetchListData
  ]);

  useEffect(() => {
    if (activeTab === 'List') {
      // Simplified: always treat as server-side pagination as selectedSavedSearchId and client-side pagination logic are removed.
      fetchListData();
    }
  }, [currentPage, activeTab, fetchListData]); // Dependencies simplified, Added fetchListData

  const totalPages = Math.ceil(totalLeads / ITEMS_PER_PAGE);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages || 1, prev + 1)); // Ensure totalPages isn't 0
  };
  
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    // Reset marketing tab specific states if navigating away or to it for a fresh start
    if (tab !== 'Marketing Growth') {
      setCurrentCityInput(''); 
      setSelectedMarketingCities([]);
      setMarketingLeadCount(0);
      setMarketingError(null);
      setMarketingLoading(false);
      setMarketingProgressMessage('');
      setActiveAction(null); // Reset active action when leaving tab
      // Reset action form states as well
      setDirectMailQuantity(1);
      setGoogleSearchSelected(false);
      setFacebookInstagramAdsSelected(false);
      setLinkedInAdsSelected(false);
      setEmailCampaignSelected(false);
      setSelectedPlan(null);
    }
  };

  const handleAnalyzeOpportunities = async () => {
    setMarketingLoading(true);
    setMarketingError(null);
    setMarketingLeadCount(0);
    setMarketingProgressMessage('Analyzing market opportunities...');

    if (selectedMarketingCities.length === 0) {
      setMarketingError("Please select at least one city to analyze.");
      setMarketingLoading(false);
      setMarketingProgressMessage('');
      return;
    }

    try {
      const today = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setDate(today.getDate() + 90);
      const queryStartDate = today.toISOString().split('T')[0];
      const queryEndDate = threeMonthsLater.toISOString().split('T')[0];

      let queryBuilder = supabase
        .from('companies_house_data')
        .select('company_number') // Only fetch company_number for efficiency
        .eq('company_status', 'Active')
        .or(`and(accounts_next_due_date.gte.${queryStartDate},accounts_next_due_date.lte.${queryEndDate}),and(returns_next_due_date.gte.${queryStartDate},returns_next_due_date.lte.${queryEndDate})`);

      // Build the OR condition for multiple cities
      const cityFilters = selectedMarketingCities.map(city => `reg_address_post_town.ilike.%${city.trim()}%`).join(',');
      queryBuilder = queryBuilder.or(cityFilters);

      const { data: companies, error: dbError } = await queryBuilder;

      if (dbError) {
        console.error("Supabase dbError in marketing analysis:", dbError);
        throw dbError;
      }

      if (companies && companies.length > 0) {
        const leads = companies.filter(company => !clientCompanyNumbers.has(company.company_number));
        setMarketingLeadCount(leads.length);
        if (leads.length === 0) {
             setMarketingError(`No new leads found in the selected cities with filings due in the next 90 days.`);
        } else {
             setMarketingError(null); // Clear previous errors
        }
      } else {
        setMarketingLeadCount(0);
        setMarketingError(`No companies found in the selected cities matching the initial criteria (active, specific due dates).`);
      }

    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("Error analyzing marketing opportunities:", errorMessage);
      setMarketingError("Failed to analyze opportunities. " + errorMessage);
      setMarketingLeadCount(0);
    } finally {
      setMarketingLoading(false);
      setMarketingProgressMessage('');
    }
  };

  const handleToActionClick = (actionType: string | null) => {
    setActiveAction(actionType);
    // Always reset all action-specific states when changing action or deselecting
    setDirectMailQuantity(marketingLeadCount > 0 ? Math.min(10, marketingLeadCount) : 1);
    setEmailCampaignSelected(false);
    setGoogleSearchSelected(false);
    setFacebookInstagramAdsSelected(false);
    setLinkedInAdsSelected(false);
    setSelectedPlan(null);

    if (actionType === 'directMail') {
      // Specific initialization for directMail if any, though quantity is already set above.
    } else if (actionType === 'digitalCampaign') {
      // Specific initialization for digitalCampaign if any. Current reset is comprehensive.
    }
  };

  const handleConfirmDigitalCampaign = async () => {
    // Get current user's email
    let submitterEmail = 'N/A';
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (user && user.email) {
      submitterEmail = user.email;
    } else if (userError) {
      console.error("Error fetching user for email notification:", userError.message);
    }

    const selectedServices = [];
    if (emailCampaignSelected) selectedServices.push('Email');
    if (googleSearchSelected) selectedServices.push('Google Search Ads');
    if (facebookInstagramAdsSelected) selectedServices.push('Facebook & Instagram Ads');
    if (linkedinAdsSelected) selectedServices.push('LinkedIn Ads');

    const planInfo = planDetails[selectedPlan!] || { name: 'N/A', cost: 'N/A' }; // Ensure cost default is string
    const recipientEmail = 'fabian@accflow.org'; // Target recipient

    const subject = `New Digital Campaign Request - ${planInfo.name}`;
    const htmlBody = `
      <p>A new digital campaign has been configured:</p>
      <ul>
        <li><strong>Selected Services:</strong> ${selectedServices.join(', ') || 'None'}</li>
        <li><strong>Recommended Plan:</strong> ${planInfo.name} (£${planInfo.cost}${planInfo.cost.endsWith('+') ? '' : '/month'})</li>
        <li><strong>Target Cities:</strong> ${selectedMarketingCities.join(', ') || 'N/A'}</li>
        <li><strong>Potential Leads in Area:</strong> ${marketingLeadCount}</li>
        <li><strong>Submitted By:</strong> ${submitterEmail}</li>
      </ul>
      <p>This is a request to set up the campaign. Ad spend is not included in the plan price.</p>
      <p>Thank for sending this, someone in out team witll get bakc to you.</p>
    `;

    try {
      const response = await fetch('/api/send-marketing-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: subject,
          html: htmlBody,
          fromName: 'AccFlow New Leads System', // Optional: customize sender name
          requestingUserEmail: submitterEmail // Add submitter email to payload
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`Campaign request sent successfully to ${recipientEmail}! Our team will be in touch.`);
      } else {
        console.error('Failed to send campaign email:', result.error || result.message);
        alert(`There was an issue sending the campaign request: ${result.error || result.message || 'Please try again.'}`);
      }
    } catch (error) {
      console.error('Error submitting campaign request:', error);
      alert('An unexpected error occurred while sending the campaign request. Please check the console.');
    }

    handleToActionClick(null); // Go back to the main action buttons
  };

  const handleAddCity = () => {
    const cityToAdd = currentCityInput.trim().toUpperCase(); // Standardize to uppercase like postTownOptions
    if (cityToAdd && !selectedMarketingCities.includes(cityToAdd) && postTownOptions.includes(cityToAdd)) {
      setSelectedMarketingCities([...selectedMarketingCities, cityToAdd]);
      setCurrentCityInput('');
    } else if (cityToAdd && !postTownOptions.includes(cityToAdd)) {
      // Optional: alert user if city not in known list, or allow adding anyway
      alert("City not found in the suggestion list. Please select a valid city from the suggestions.");
    } else if (cityToAdd && selectedMarketingCities.includes(cityToAdd)) {
      alert("City already selected.");
    }
  };

  const handleRemoveCity = (cityToRemove: string) => {
    setSelectedMarketingCities(selectedMarketingCities.filter(city => city !== cityToRemove));
  };

  const renderTakeActionForms = () => {
    if (!activeAction) return null;

    // const costToShow = (cost: number) => cost.toFixed(2); // No longer used here
    // const roundToWhole = (num: number) => Math.round(num); // No longer used here

    const displayCitiesString = selectedMarketingCities.length > 0 ? selectedMarketingCities.join(', ') : 'your target area';
    
    const digitalCampaignOptions = [
      { id: 'emailCampaign', checked: emailCampaignSelected, setter: setEmailCampaignSelected, title: 'Email Campaign', description: `Direct email outreach to potential leads in "${displayCitiesString}".` },
      { id: 'googleSearchAds', checked: googleSearchSelected, setter: setGoogleSearchSelected, title: 'Google Search Ads', description: `Boost visibility when clients in "${displayCitiesString}" search on Google.` },
      { id: 'facebookInstagramAds', checked: facebookInstagramAdsSelected, setter: setFacebookInstagramAdsSelected, title: 'Facebook & Instagram Ads', description: `Target individuals and businesses on social media in the "${displayCitiesString}" area.` },
      { id: 'linkedinAds', checked: linkedinAdsSelected, setter: setLinkedInAdsSelected, title: 'LinkedIn Ads', description: `Reach professionals and companies in "${displayCitiesString}" on LinkedIn.` },
    ];

    const currentRecommendedPlanDetails = selectedPlan ? planDetails[selectedPlan] : null;

    return (
      <div className="mt-6 p-6 bg-white border border-gray-200 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-indigo-700">
            {activeAction === 'directMail' && 'Direct Mail Campaign Setup'}
            {activeAction === 'digitalCampaign' && 'Digital Marketing Campaign Setup'}
          </h3>
          <button 
            onClick={() => setActiveAction(null)} 
            className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 hover:text-gray-800 transition-colors"
          >
            &larr; Back
          </button>
        </div>

        {activeAction === 'directMail' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="directMailQuantitySlider" className="block text-sm font-medium text-gray-700 mb-1">
                Number of letters to send: <span className="font-bold text-indigo-600 text-base">{directMailQuantity.toLocaleString()}</span> (max: {marketingLeadCount.toLocaleString()})
              </label>
              <input 
                type="range" 
                id="directMailQuantitySlider"
                value={directMailQuantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val >= 1 && val <= marketingLeadCount) {
                    setDirectMailQuantity(val);
                  } else if (val > marketingLeadCount && marketingLeadCount > 0) {
                    setDirectMailQuantity(marketingLeadCount);
                  } else {
                    setDirectMailQuantity(1);
                  }
                }}
                min="1"
                max={marketingLeadCount > 0 ? marketingLeadCount : 1}
                className="w-full h-3 bg-gray-300 rounded-lg appearance-none cursor-pointer mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed thumb:bg-indigo-600"
                disabled={marketingLeadCount === 0}
              />
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg space-y-2">
              <p className="text-sm text-indigo-800"><span className="font-semibold">Cost per letter:</span> £{DIRECT_MAIL_COST_PER_LETTER.toFixed(2)}</p>
              <p className="text-lg font-bold text-indigo-900">
                Total Estimated Cost: £{(directMailQuantity * DIRECT_MAIL_COST_PER_LETTER).toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                Industry average response rates for direct mail can be 2-9%. Assuming ~7% for projection:
              </p>
              <p className="text-md font-semibold text-gray-800">
                Estimated Responses: <span className="text-green-600">{Math.round(directMailQuantity * 0.07)}</span>
              </p>
            </div>
            <button 
              className="w-full px-4 py-2.5 mt-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
              disabled={marketingLeadCount === 0 || directMailQuantity < 1}
              onClick={() => alert(`Proceeding with Direct Mail for ${directMailQuantity} letters. (Integration needed)`)}
            >
              Confirm Campaign (Cost: £{(directMailQuantity * DIRECT_MAIL_COST_PER_LETTER).toFixed(2)})
            </button>
          </div>
        )}

        {activeAction === 'digitalCampaign' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-md font-semibold text-gray-700 mb-3">1. Select Services You Need:</h4>
              <div className="space-y-3">
                {digitalCampaignOptions.map(option => (
                  <div key={option.id} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-start">
                      <input 
                        id={option.id} type="checkbox" className="h-5 w-5 text-indigo-600 border-gray-300 rounded mt-0.5 focus:ring-indigo-500 cursor-pointer"
                        checked={option.checked} onChange={(e) => option.setter(e.target.checked)} 
                      />
                      <div className="ml-3 flex-grow">
                        <label htmlFor={option.id} className="font-medium text-gray-800 cursor-pointer">{option.title}</label>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommended Plan Section */}
            {currentRecommendedPlanDetails ? (
              <div className={`mt-6 p-5 border-2 border-${currentRecommendedPlanDetails.color}-500 rounded-xl shadow-lg bg-${currentRecommendedPlanDetails.color}-50`}>
                <h4 className={`text-xl font-semibold text-${currentRecommendedPlanDetails.color}-700 mb-2`}>
                  2. Recommended Plan: {currentRecommendedPlanDetails.name}
                </h4>
                <p className={`text-3xl font-extrabold text-${currentRecommendedPlanDetails.color}-800 mb-1`}>
                  £{currentRecommendedPlanDetails.cost}
                  <span className="text-sm font-normal text-gray-600">{currentRecommendedPlanDetails.cost.endsWith('+') ? ' per month' : '/month'}</span>
                </p>
                <p className={`text-sm text-${currentRecommendedPlanDetails.color}-600 mb-3`}>{currentRecommendedPlanDetails.description}</p>
                
                <h5 className="text-sm font-semibold text-gray-700 mt-3 mb-1">Plan includes:</h5>
                <ul className="space-y-1 text-sm mb-3">
                  {currentRecommendedPlanDetails.services.map(service => (
                    <li key={service} className="flex items-center">
                      <svg className={`w-4 h-4 mr-2 text-${currentRecommendedPlanDetails.color}-500 flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                      </svg>
                      <span className="text-gray-700">{service}</span>
                    </li>
                  ))}
                </ul>

                {(() => {
                    const selectedServiceTitles = digitalCampaignOptions.filter(opt => opt.checked).map(opt => opt.title);
                    if (selectedServiceTitles.length === 0) return null; // Should not happen if a plan is recommended

                    const unfulfilledServices = selectedServiceTitles.filter(title => !currentRecommendedPlanDetails.services.includes(title));
                    const overfulfilledServices = currentRecommendedPlanDetails.services.filter(title => !selectedServiceTitles.includes(title));
                    
                    let message = "";
                    if (unfulfilledServices.length > 0) {
                        message += `Your selection includes services not covered by the ${currentRecommendedPlanDetails.name} (e.g., ${unfulfilledServices.join(', ')}). `;
                        // Determine the next highest plan needed
                        let nextPlanKey = null;
                        if (unfulfilledServices.some(s => planDetails.enterprise.services.includes(s)) && currentRecommendedPlanDetails.tier < 3) nextPlanKey = 'enterprise';
                        else if (unfulfilledServices.some(s => planDetails.pro.services.includes(s)) && currentRecommendedPlanDetails.tier < 2) nextPlanKey = 'pro';
                        if (nextPlanKey) {
                            message += `For full coverage of your selections, the ${planDetails[nextPlanKey].name} would be better. `;
                        } else if (currentRecommendedPlanDetails.tier < 3) {
                             message += `Consider upgrading your plan or contact us for a custom quote if these services are essential. `;
                        }
                    } else if (overfulfilledServices.length > 0 && selectedServiceTitles.length > 0) {
                        // Optional: Could add a message if the plan covers more than selected, but this is generally fine.
                        // message += `The ${currentRecommendedPlanDetails.name} also covers ${overfulfilledServices.join(', ')}. `;
                    }

                    if (message) {
                        return (
                            <p className="text-xs text-orange-600 mt-2 p-2 bg-orange-50 rounded-md">
                                {message}
                            </p>
                        );
                    }
                    return null;
                })()}

                <p className="text-xs text-gray-500 mt-3">
                  Please note: Ad spend is separate and not included in the monthly plan price.
                </p>
              </div>
            ) : (
              <div className="mt-6 p-6 bg-gray-100 rounded-lg text-center border border-gray-200">
                <p className="text-gray-700 font-medium">Please select the services you need above.</p>
                <p className="text-sm text-gray-500 mt-1">A tailored plan will be recommended for you here.</p>
              </div>
            )}
            
            <button 
              onClick={handleConfirmDigitalCampaign}
              className="w-full px-4 py-3 mt-8 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
              disabled={!selectedPlan || (!emailCampaignSelected && !googleSearchSelected && !facebookInstagramAdsSelected && !linkedinAdsSelected)}
            >
              Contact a Marketing Specialist
            </button>
            <p className="text-xs text-center text-gray-500 mt-2">
              By confirming, our team will contact you to finalize details and begin the setup process.
            </p>
          </div>
        )}
      </div>
    );
  };

  if (loadingClientNumbers) {
      return <div className="container mx-auto p-4 text-center">Loading client data...</div>;
  }
  if (errorClientNumbers) {
      return <div className="container mx-auto p-4 text-center text-red-500">Error loading client data: {errorClientNumbers}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">New Leads</h1>
        <p className="mt-2 text-gray-600"> 
          Add companies to your <Link href="/dashboard/clients" className="text-indigo-600 hover:underline font-medium">Clients list</Link> to hide them from this shared New Leads view. This helps prevent other accountants from contacting your clients.
        </p>
      </div>

      <div className="mb-6 bg-white rounded-xl shadow-sm">
        <nav className="flex" aria-label="Tabs">
          {['List', 'Marketing Growth'].map((tabName) => (
            <button
              key={tabName}
              onClick={() => handleTabChange(tabName as Tab)}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === tabName
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tabName}
            </button>
          ))}
        </nav>
      </div>
      
      {activeTab === 'List' && (
        <div>
          <div className="mb-6 p-5 border rounded-xl shadow-sm bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Overall Due From</label>
                <input 
                  type="date" 
                  id="start-date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">Overall Due To</label>
                <input 
                  type="date" 
                  id="end-date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  min={startDate}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label htmlFor="specific-accounts-due-start-date" className="block text-sm font-medium text-gray-700 mb-1">Accounts Due From (Specific)</label>
                <input 
                  type="date" 
                  id="specific-accounts-due-start-date"
                  value={specificAccountsDueStartDate}
                  onChange={(e) => {
                    setSpecificAccountsDueStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="specific-accounts-due-end-date" className="block text-sm font-medium text-gray-700 mb-1">Accounts Due To (Specific)</label>
                <input 
                  type="date" 
                  id="specific-accounts-due-end-date"
                  value={specificAccountsDueEndDate}
                  onChange={(e) => {
                    setSpecificAccountsDueEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  min={specificAccountsDueStartDate}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label htmlFor="specific-confirmation-due-start-date" className="block text-sm font-medium text-gray-700 mb-1">Conf. Stmt Due From (Specific)</label>
                <input 
                  type="date" 
                  id="specific-confirmation-due-start-date"
                  value={specificConfirmationStatementStartDate}
                  onChange={(e) => {
                    setSpecificConfirmationStatementStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="specific-confirmation-due-end-date" className="block text-sm font-medium text-gray-700 mb-1">Conf. Stmt Due To (Specific)</label>
                <input 
                  type="date" 
                  id="specific-confirmation-due-end-date"
                  value={specificConfirmationStatementEndDate}
                  onChange={(e) => {
                    setSpecificConfirmationStatementEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  min={specificConfirmationStatementStartDate}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="city-filter" className="block text-sm font-medium text-gray-700 mb-1">City / County</label>
                <input 
                  type="text" 
                  id="city-filter"
                  value={cityFilter}
                  onChange={(e) => {
                    setCityFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="e.g., London or type to filter"
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  list="post-town-options"
                />
                <datalist id="post-town-options">
                  {postTownOptions.map(town => (
                    <option key={town} value={town} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="postcode-filter" className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                <input 
                  type="text" 
                  id="postcode-filter"
                  value={postcodeFilter}
                  onChange={(e) => {
                    setPostcodeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="e.g., SW1A or EC1"
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
          )}
          {error && <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">{error}</div>}
          {!loading && !error && leadCompanies.length === 0 && (
            <div className="bg-gray-50 p-8 rounded-xl text-center">
              <p className="text-gray-600">No companies found matching the criteria in the date range.</p>
            </div>
          )}
          {!loading && !error && leadCompanies.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {leadCompanies.map((company) => {
                  const displayAddress = [
                      company.reg_address_address_line1,
                      company.reg_address_post_town,
                      company.reg_address_post_code
                  ].filter(Boolean).join(', ');
                  return (
                    <div key={company.company_number} className="p-5 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow">
                      <h3 className="text-lg font-semibold text-indigo-700 mb-2">{company.company_name || 'N/A'}</h3>
                      {displayAddress && (
                         <div className="flex items-start mb-2">
                           <svg className="h-5 w-5 text-gray-500 mr-2 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                             <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                             <circle cx="12" cy="10" r="3"></circle>
                           </svg>
                           <p className="text-sm text-gray-600">{displayAddress}</p> 
                         </div>
                      )}
                      <div className="space-y-1 mt-3">
                        {company.accounts_next_due_date && (
                          <div className="flex items-start">
                            <svg className="h-5 w-5 text-gray-500 mr-2 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="16" y1="2" x2="16" y2="6"></line>
                              <line x1="8" y1="2" x2="8" y2="6"></line>
                              <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Next Accounts Due:</span> {new Date(company.accounts_next_due_date).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                        {company.returns_next_due_date && (
                          <div className="flex items-start">
                            <svg className="h-5 w-5 text-gray-500 mr-2 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              <line x1="16" y1="13" x2="8" y2="13"></line>
                              <line x1="16" y1="17" x2="8" y2="17"></line>
                              <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Next Confirmation Statement Due:</span> {new Date(company.returns_next_due_date).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 0 && (
                <div className="flex justify-between items-center mt-6 bg-white p-4 rounded-lg shadow-sm">
                  <button 
                    onClick={handlePrevPage} 
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages} (Total matching: {totalLeads})
                  </span>
                  <button 
                    onClick={handleNextPage} 
                    disabled={currentPage === totalPages || totalLeads === 0}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      {activeTab === 'Marketing Growth' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Analyze Local Market Opportunities</h2>
            <p className="text-sm text-gray-600 mb-4">
              Select one or more cities to discover active companies that have filings due within the next 90 days and are not yet your clients in Accflow.
            </p>
            
            <div className="mb-6">
              <label htmlFor="marketing-city-input" className="block text-sm font-medium text-gray-700 mb-1">Add City</label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  id="marketing-city-input"
                  value={currentCityInput}
                  onChange={(e) => setCurrentCityInput(e.target.value.toUpperCase())} // Standardize input to uppercase
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCity(); }}}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., London, Manchester"
                  disabled={marketingLoading}
                  list="post-town-options-marketing"
                />
                <button 
                  onClick={handleAddCity} 
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  disabled={marketingLoading || !currentCityInput.trim() || !postTownOptions.includes(currentCityInput.trim().toUpperCase())}
                >
                  Add
                </button>
              </div>
              <datalist id="post-town-options-marketing">
                {postTownOptions
                  .filter(town => !selectedMarketingCities.includes(town))
                  .map(town => (
                    <option key={town} value={town} />
                ))}
              </datalist>

              {selectedMarketingCities.length > 0 && (
                <div className="mt-3 space-y-2">
                  <h4 className="text-xs font-medium text-gray-500 uppercase">Selected Cities:</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedMarketingCities.map(city => (
                      <div key={city} className="flex items-center bg-indigo-100 text-indigo-700 text-sm font-medium px-3 py-1 rounded-full">
                        <span>{city}</span>
                        <button 
                          onClick={() => handleRemoveCity(city)} 
                          className="ml-2 text-indigo-500 hover:text-indigo-700 focus:outline-none"
                          disabled={marketingLoading}
                          aria-label={`Remove ${city}`}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-end">
                <button 
                  onClick={handleAnalyzeOpportunities}
                  disabled={marketingLoading || selectedMarketingCities.length === 0}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {marketingLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                      {marketingProgressMessage || 'Analyzing...'}
                    </div>
                  ) : 'Analyze Opportunities'}
                </button>
              </div>
            </div>

            {marketingError && (
              <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-lg">{marketingError}</div>
            )}

            {/* Show results and action items only on successful analysis with leads */}
            {!marketingLoading && !marketingError && marketingLeadCount > 0 && (
              <>
                <div className="p-6 mb-6 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="text-2xl font-semibold text-green-700">
                    {marketingLeadCount === 1000 ? 'Over 1,000' : marketingLeadCount.toLocaleString()} potential new clients found!
                  </h3>
                  <p className="text-green-600 mt-1">
                    These are active companies in &quot;{selectedMarketingCities.join(', ')}&quot; with filings due in the next 90 days, which are not currently in your Accflow client list.
                    {marketingLeadCount === 1000 ? ' (The actual number could be higher.)' : ''}
                  </p>
                </div>
              
                {/* Main "Take Action" Buttons or The Active Form */} 
                {activeAction ? renderTakeActionForms() : (
                  <div className="mt-8">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">Take Action:</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <button
                              onClick={() => handleToActionClick('directMail')}
                              className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left disabled:opacity-50"
                              disabled={marketingLeadCount === 0}
                          >
                              <h4 className="font-medium text-gray-700 mb-2">Direct Mail Campaign</h4>
                              <p className="text-sm text-gray-600 mb-3">Reach out via traditional post.</p>
                              <span className="text-sm text-indigo-600 font-medium">Configure &rarr;</span>
                          </button>
                          <button
                              onClick={() => handleToActionClick('digitalCampaign')}
                              className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left disabled:opacity-50"
                              disabled={marketingLeadCount === 0} 
                          >
                              <h4 className="font-medium text-gray-700 mb-2">Digital Campaign</h4>
                              <p className="text-sm text-gray-600 mb-3">Launch online ads and email campaigns.</p>
                              <span className="text-sm text-indigo-600 font-medium">Select Options &rarr;</span>
                          </button>
                      </div>
                  </div>
                )}
              </>
            )}
          </div>
       
      )}
    </div>
  );
}