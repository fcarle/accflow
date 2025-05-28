'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
// import dynamic from 'next/dynamic'; // Keep if MarkerClusterGroup is still used by some other part, otherwise remove
import { supabase } from '@/lib/supabase';
// import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'; // Removed PostgrestTransformBuilder
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

// Updated Tab type and names
type Tab = 'Lead Engine' | 'Campaign Studio' | 'Contacted Leads'; // Added 'Contacted Leads'

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
  latitude?: number | null;
  longitude?: number | null;
}

// Define an interface for our new dashboard statistics
interface DashboardStats {
  topCounties: Array<{ county: string; count: number }>;
}

// Interface for the shape of companies_house_data when joined in fetchContactLog
interface CHDataForContactLog {
  company_name: string | null;
  reg_address_address_line1: string | null;
  reg_address_post_town: string | null;
  reg_address_post_code: string | null;
  accounts_next_due_date: string | null;
  returns_next_due_date: string | null;
  reg_address_address_line2?: string | null; 
  reg_address_county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const ITEMS_PER_PAGE = 20;

export default function NewLeadsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Lead Engine');
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

  // Add new state for filing type filter
  type FilingType = 'all' | 'accounts' | 'confirmation';
  const [filingTypeFilter, setFilingTypeFilter] = useState<FilingType>('all');

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

  const [countyFilter, setCountyFilter] = useState<string>('');
  const [postcodeFilter, setPostcodeFilter] = useState<string>('');
  const [countyOptions, setCountyOptions] = useState<string[]>([]);

  // State for new dashboard statistics
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    topCounties: [],
  });
  const [loadingDashboardStats, setLoadingDashboardStats] = useState<boolean>(true);

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
  const [digitalCampaignBudget, setDigitalCampaignBudget] = useState<number>(0); // Added state for budget

  // New states for Direct Mail multi-step setup
  type DirectMailStep = 'setQuantity' | 'designLetter' | 'previewRecipients' | 'previewAndConfirm'; // Added 'previewRecipients'
  const [directMailStep, setDirectMailStep] = useState<DirectMailStep>('setQuantity');
  const initialLetterHtml = `<p>Loading template...</p>`; // Basic placeholder, will be overwritten
  const [letterHtmlContent, setLetterHtmlContent] = useState<string>(initialLetterHtml);
  const letterHtmlTextAreaRef = useRef<HTMLTextAreaElement>(null);

  // New state for sample lead data for preview
  const [samplePreviewLead, setSamplePreviewLead] = useState<CompanyData | null>(null);
  const [loadingSampleLead, setLoadingSampleLead] = useState<boolean>(false);

  // New state for user's email
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  // New states for Contact Log and recently contacted companies
  interface ContactLogEntry extends CompanyData { // Extending CompanyData for display purposes
    id: string; // Added: ID from the contact_log table
    contact_date: string;
    campaign_type: string;
    notes?: string;
    target_cities?: string[];
    letter_html_content?: string;
    // latitude and longitude will be inherited from CompanyData and are now number | null | undefined
  }
  const [contactLog, setContactLog] = useState<ContactLogEntry[]>([]);
  const [loadingContactLog, setLoadingContactLog] = useState<boolean>(false);
  const [errorContactLog, setErrorContactLog] = useState<string | null>(null);
  const [recentlyContactedNumbers, setRecentlyContactedNumbers] = useState<Set<string>>(new Set());
  // const [loadingRecentlyContacted, setLoadingRecentlyContacted] = useState<boolean>(true); // Removed as unused

  // State for the list of companies to be contacted in the current direct mail batch
  const [directMailRecipientList, setDirectMailRecipientList] = useState<CompanyData[]>([]);

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

  const fetchRecentlyContactedNumbers = useCallback(async () => {
    // setLoadingRecentlyContacted(true); // This line was correctly removed/commented
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRecentlyContactedNumbers(new Set());
        return;
      }

      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const { data, error } = await supabase
        .from('contact_log')
        .select('company_number')
        .eq('user_id', user.id)
        .gte('contact_date', oneMonthAgo.toISOString()); // Only fetch contacts from the last month to keep it relevant

      if (error) throw error;
      const numbers = new Set(data?.map(log => log.company_number).filter(Boolean) || []);
      setRecentlyContactedNumbers(numbers);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("Failed to load recently contacted companies: " + errorMessage);
      // Don't set an error message for the user, just log it, as this isn't critical for core functionality
      setRecentlyContactedNumbers(new Set());
    } finally {
      // No call to setLoadingRecentlyContacted here as the state itself is removed
    }
  }, []);

  useEffect(() => {
    // fetchSavedSearches(); // Removed call
    fetchClientCompanyNumbers();
    fetchRecentlyContactedNumbers(); // Added call

    const fetchCounties = async () => {
      try {
        const { data, error } = await supabase
          .from('companies_house_data')
          .select('reg_address_county');

        if (error) {
          console.error('Error fetching distinct counties:', error);
          return;
        }

        if (data) {
          const uniqueCounties = Array.from(
            new Set(
              data
                .map(item => item.reg_address_county)
                .filter(county => county !== null && county.trim() !== '')
                .map(county => county!.toUpperCase())
            )
          ).sort();
          setCountyOptions(uniqueCounties);
        }
      } catch (e) {
        console.error('Error processing distinct counties:', e);
      }
    };

    fetchCounties();
  }, [fetchClientCompanyNumbers, fetchRecentlyContactedNumbers]); // Added fetchRecentlyContactedNumbers dependency

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
      const trimmedCountyFilter = countyFilter.trim();
      const trimmedPostcodeFilter = postcodeFilter.trim();
      
      try {
        // Helper function to apply common filters
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyBaseFilters = (query: any): any => { // Reverted to any, with eslint-disable
          let q = query;
          // Apply date and filing type filters
          if (filingTypeFilter === 'accounts') {
            q = q.gte('accounts_next_due_date', lowerBoundDateQuery)
                 .lte('accounts_next_due_date', upperBoundDateQuery);
          } else if (filingTypeFilter === 'confirmation') {
            q = q.gte('returns_next_due_date', lowerBoundDateQuery)
                 .lte('returns_next_due_date', upperBoundDateQuery);
          } else { // 'all' filing types
            q = q.or(
              `and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),` +
              `and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`
            );
          }
          
          q = q.eq('company_status', 'Active');

          if (trimmedCountyFilter) {
            q = q.ilike('reg_address_county', `%${trimmedCountyFilter}%`);
          }

          if (trimmedPostcodeFilter) {
            q = q.ilike('reg_address_post_code', `%${trimmedPostcodeFilter.replace(/\s+/g, '')}%`);
          }

          if (clientCompanyNumbers && clientCompanyNumbers.size > 0) {
            q = q.not('company_number', 'in', `(${Array.from(clientCompanyNumbers).map(n => `'${n}'`).join(',')})`);
          }
          return q;
        };

        // 1. Get the total count
        let countQuery = supabase
          .from('companies_house_data')
          .select('', { count: 'exact' }) // Removed head: true
          .eq('company_status', 'Active')
          .or(`and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),` +
              `and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`);
        countQuery = applyBaseFilters(countQuery);
        const { count, error: countError } = await countQuery;

        if (countError) {
          console.error("Supabase countError object (debug):", countError);
          throw countError;
        }
        setTotalLeads(count ?? 0);

        // 2. Get paginated data
        let dataQuery = supabase
          .from('companies_house_data')
          .select('company_number, company_name, accounts_next_due_date, returns_next_due_date, company_status, reg_address_address_line1, reg_address_address_line2, reg_address_post_town, reg_address_county, reg_address_post_code');
        dataQuery = applyBaseFilters(dataQuery);
        dataQuery = dataQuery.range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
        
        const { data, error: dataError } = await dataQuery;
        
        if (dataError) {
          console.error("Supabase dataError object (debug):", dataError);
          throw dataError;
        }
        
        setLeadCompanies(data || []); 
        filteredLeadsRef.current = data || [];

      } catch (e: unknown) {
        console.error("Caught error in fetchListData (Vercel debug):", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError("Failed to load leads. " + errorMessage);
      } finally {
        setLoading(false);
      }
  }, [startDate, endDate, currentPage, clientCompanyNumbers, loadingClientNumbers, countyFilter, postcodeFilter, filingTypeFilter]);

  const previousDepsRef = useRef({
    startDate: '',
    endDate: '',
    countyFilter: '',
    postcodeFilter: '',
    clientCompanyNumbers: new Set<string>(),
    filingTypeFilter: 'all' as FilingType,
  });

  useEffect(() => {
    const dependenciesChanged = () => {
        const currentDeps = {
            startDate,
            endDate,
            countyFilter,
            postcodeFilter,
            clientCompanyNumbers,
            filingTypeFilter,
        };
        const prev = previousDepsRef.current;
        if (
            prev.startDate !== currentDeps.startDate || 
            prev.endDate !== currentDeps.endDate || 
            prev.countyFilter !== currentDeps.countyFilter ||
            prev.postcodeFilter !== currentDeps.postcodeFilter ||
            prev.clientCompanyNumbers !== currentDeps.clientCompanyNumbers || 
            prev.filingTypeFilter !== currentDeps.filingTypeFilter
        ) {
            previousDepsRef.current = currentDeps;
            return true;
        }
        return false;
    };

    if (activeTab === 'Lead Engine') {
        if (dependenciesChanged() || leadCompanies.length === 0 && !loading) {
            fetchListData();
        }
    }
  }, [
    activeTab, 
    startDate, 
    endDate, 
    countyFilter, 
    postcodeFilter,
    clientCompanyNumbers, 
    leadCompanies.length, 
    loading,
    filingTypeFilter,
    fetchListData
  ]);

  useEffect(() => {
    if (activeTab === 'Lead Engine') {
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
    if (tab !== 'Campaign Studio') {
      setCurrentCityInput(''); 
      setSelectedMarketingCities([]);
      setMarketingLeadCount(0);
      setMarketingError(null);
      setMarketingLoading(false);
      setMarketingProgressMessage('');
      setActiveAction(null); 
      setDirectMailQuantity(1);
      setDirectMailRecipientList([]); 
      setGoogleSearchSelected(false);
      setFacebookInstagramAdsSelected(false);
      setLinkedInAdsSelected(false);
      setEmailCampaignSelected(false);
      setSelectedPlan(null);
      setDigitalCampaignBudget(0); // Reset budget
    }
    if (tab === 'Contacted Leads' && !loadingContactLog) { // Fetch log if tab is opened and not already loading
      fetchContactLog(); // Check contactLog.length can be removed if we always want a fresh fetch or rely on loading state
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

      // Start query with select for count, then apply filters
      let queryBuilder = supabase
        .from('companies_house_data')
        .select('', { count: 'exact' }) // Removed head: true
        .eq('company_status', 'Active')
        .or(`and(accounts_next_due_date.gte.${queryStartDate},accounts_next_due_date.lte.${queryEndDate}),and(returns_next_due_date.gte.${queryStartDate},returns_next_due_date.lte.${queryEndDate})`);

      // Apply city filters
      const cityFilters = selectedMarketingCities.map(city => `reg_address_post_town.ilike.%${city.trim()}%`).join(',');
      queryBuilder = queryBuilder.or(cityFilters);

      // Apply client and recently contacted filters
      if (clientCompanyNumbers && clientCompanyNumbers.size > 0) {
        queryBuilder = queryBuilder.not('company_number', 'in', `(${Array.from(clientCompanyNumbers).map(n => `'${n}'`).join(',')})`);
      }
      if (recentlyContactedNumbers && recentlyContactedNumbers.size > 0) {
        queryBuilder = queryBuilder.not('company_number', 'in', `(${Array.from(recentlyContactedNumbers).map(n => `'${n}'`).join(',')})`);
      }

      // Execute the query
      const { count, error: dbError } = await queryBuilder;

      if (dbError) {
        console.error("Supabase dbError in marketing analysis count (raw object):", dbError);
        let detailedMessage = 'Error details: ';
        try {
          detailedMessage += JSON.stringify(dbError, Object.getOwnPropertyNames(dbError));
        } catch { // Removed unused _e
          detailedMessage += 'Could not stringify error object.';
        }
        console.error("Supabase dbError (processed):", detailedMessage);
        throw dbError;
      }

      const finalCount = count ?? 0;
      setMarketingLeadCount(finalCount);

      if (finalCount > 0) {
        setMarketingError(null); // Clear previous errors
      } else {
        setMarketingError(`No new, uncontacted leads found in the selected cities with filings due in the next 90 days.`);
      }

    } catch (e: unknown) {
      console.error("Caught error object in catch block (raw):", e);
      let errorMessage = "An unexpected error occurred.";
      if (typeof e === 'object' && e !== null) {
        // Attempt to get message if it's a proper error or PostgrestError
        if ('message' in e && typeof e.message === 'string' && e.message.trim() !== '') {
          errorMessage = e.message;
        } else {
          // Fallback to stringifying the object if message is not useful
          try {
            errorMessage = JSON.stringify(e, Object.getOwnPropertyNames(e));
            if (errorMessage === '{}') errorMessage = 'Error object stringified to empty object.';
          } catch { // Removed unused _stringifyError
            errorMessage = 'Could not stringify caught error object.';
          }
        }
        // Log other potential properties of PostgrestError for more details
        if ('details' in e) console.error("Caught error details:", e.details);
        if ('hint' in e) console.error("Caught error hint:", e.hint);
        if ('code' in e) console.error("Caught error code:", e.code);
      } else if (e !== null && e !== undefined && e.toString) {
        errorMessage = e.toString();
      }

      console.error("Error analyzing marketing opportunities (processed message):", errorMessage);
      setMarketingError("Failed to analyze opportunities. " + errorMessage);
      setMarketingLeadCount(0);
    } finally {
      setMarketingLoading(false);
      setMarketingProgressMessage('');
    }
  };

  // Function to fetch direct mail recipients
  const fetchDirectMailRecipients = async () => { 
    // ... existing code from previous correct version ...
    if (selectedMarketingCities.length === 0) {
      setDirectMailRecipientList([]);
      return;
    }
    setLoading(true); 
    setError(null);
    try {
      const today = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setDate(today.getDate() + 90);
      const queryStartDate = today.toISOString().split('T')[0];
      const queryEndDate = threeMonthsLater.toISOString().split('T')[0];
      let queryBuilder = supabase
        .from('companies_house_data')
        .select('company_name, company_number, accounts_next_due_date, returns_next_due_date, reg_address_address_line1, reg_address_post_town, reg_address_county, reg_address_post_code')
        .eq('company_status', 'Active')
        .or(`and(accounts_next_due_date.gte.${queryStartDate},accounts_next_due_date.lte.${queryEndDate}),and(returns_next_due_date.gte.${queryStartDate},returns_next_due_date.lte.${queryEndDate})`);
      const cityFilters = selectedMarketingCities.map(city => `reg_address_post_town.ilike.%${city.trim()}%`).join(',');
      queryBuilder = queryBuilder.or(cityFilters);
      if (clientCompanyNumbers && clientCompanyNumbers.size > 0) {
        queryBuilder = queryBuilder.not('company_number', 'in', `(${Array.from(clientCompanyNumbers).map(n => `'${n}'`).join(',')})`);
      }
      if (recentlyContactedNumbers && recentlyContactedNumbers.size > 0) {
        queryBuilder = queryBuilder.not('company_number', 'in', `(${Array.from(recentlyContactedNumbers).map(n => `'${n}'`).join(',')})`);
      }
      queryBuilder = queryBuilder.limit(directMailQuantity);
      const { data: companies, error: dbError } = await queryBuilder;
      if (dbError) {
        console.error("Supabase dbError in fetchDirectMailRecipients:", dbError);
        throw dbError;
      }
      setDirectMailRecipientList(companies || []);
      if (companies && companies.length === 0) {
        console.log("No companies found for direct mail batch after filtering.");
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("Error fetching direct mail recipients:", errorMessage);
      setError("Failed to fetch recipients for direct mail. " + errorMessage);
      setDirectMailRecipientList([]);
    } finally {
      setLoading(false);
    }
  }; 
  // End of fetchDirectMailRecipients

  // Function to insert merge fields into the textarea
  const insertMergeField = (mergeField: string) => {
    const textarea = letterHtmlTextAreaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const newText = text.substring(0, start) + mergeField + text.substring(end);
      setLetterHtmlContent(newText);
      requestAnimationFrame(() => {
        if (letterHtmlTextAreaRef.current) {
          letterHtmlTextAreaRef.current.focus();
          const newCursorPosition = start + mergeField.length;
          letterHtmlTextAreaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      });
    }
  };

  // Function to fetch a single sample lead for the preview
  const fetchSampleLeadForPreview = async (company?: CompanyData) => { 
    if (company) { 
      setSamplePreviewLead(company);
      setLoadingSampleLead(false);
      return;
    }
    if (selectedMarketingCities.length === 0 && !directMailRecipientList.length) { 
      setSamplePreviewLead(null);
      setLoadingSampleLead(false); // Ensure loading is stopped
      return;
    }
    setLoadingSampleLead(true);
    try {
      if (directMailRecipientList.length > 0 && !company) {
        setSamplePreviewLead(directMailRecipientList[0]);
        // setLoadingSampleLead(false); // This should be handled by the caller or a finally block if it were the end of the async operation
        return; // Return early
      }
      const today = new Date();
      const ninetyDaysLater = new Date();
      ninetyDaysLater.setDate(today.getDate() + 90);
      const queryStartDate = today.toISOString().split('T')[0];
      const queryEndDate = ninetyDaysLater.toISOString().split('T')[0];
      let queryBuilder = supabase
        .from('companies_house_data')
        .select('company_name, accounts_next_due_date, returns_next_due_date, company_number, reg_address_address_line1, reg_address_post_town, reg_address_county, reg_address_post_code') 
        .eq('company_status', 'Active')
        .or(
          `and(accounts_next_due_date.gte.${queryStartDate},accounts_next_due_date.lte.${queryEndDate}),` +
          `and(returns_next_due_date.gte.${queryStartDate},returns_next_due_date.lte.${queryEndDate})`
        );
      const cityFilters = selectedMarketingCities.map(city => `reg_address_post_town.ilike.%${city.trim()}%`).join(',');
      if (cityFilters) queryBuilder = queryBuilder.or(cityFilters);
      if (clientCompanyNumbers && clientCompanyNumbers.size > 0) {
        queryBuilder = queryBuilder.not('company_number', 'in', `(${Array.from(clientCompanyNumbers).map(n => `'${n}'`).join(',')})`);
      }
      if (recentlyContactedNumbers && recentlyContactedNumbers.size > 0) {
        queryBuilder = queryBuilder.not('company_number', 'in', `(${Array.from(recentlyContactedNumbers).map(n => `'${n}'`).join(',')})`);
      }
      queryBuilder = queryBuilder.limit(1); 
      const { data: leadData, error } = await queryBuilder;
      if (error) throw error;
      if (leadData && leadData.length > 0) {
        setSamplePreviewLead(leadData[0] as CompanyData); 
      } else {
        setSamplePreviewLead(null);
      }
    } catch (e: unknown) { // Changed from any to unknown
      const errorMessage = e instanceof Error ? e.message : String(e); // Handle unknown type
      console.error("Error fetching sample lead for preview:", errorMessage);
      setSamplePreviewLead(null);
    } finally {
      setLoadingSampleLead(false);
    }
  };

  const handleConfirmAndSendDirectMail = async () => {
    if (directMailRecipientList.length === 0) {
      alert("No recipients selected for the direct mail campaign.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) { // Ensure user and user.email exist
      alert("User email not found. Please log in again.");
      return;
    }
    setMarketingLoading(true); 
    setMarketingProgressMessage(`Preparing preview email with ${directMailRecipientList.length} recipients...`);

    // Log to contact_log (as before)
    const contactLogEntries = directMailRecipientList.map(company => ({
      user_id: user.id,
      company_number: company.company_number,
      campaign_type: 'direct_mail_preview_email', // Updated campaign type
      target_cities: selectedMarketingCities,
      letter_html_content: letterHtmlContent, 
      notes: `Direct mail preview email for ${company.company_name || company.company_number} in ${selectedMarketingCities.join(', ')}`
    }));
    try {
      const { error: logError } = await supabase.from('contact_log').insert(contactLogEntries);
      if (logError) {
        console.error("Error logging direct mail preview contacts:", logError);
        alert(`Failed to log contacts for preview email: ${logError.message}. Proceeding with email generation.`);
      }

      // Prepare data for our new email preview API route
      const emailPreviewPayload = {
        recipients: directMailRecipientList.map(c => ({ // Map to the structure expected by the new API
          company_name: c.company_name,
          company_number: c.company_number,
          accounts_next_due_date: c.accounts_next_due_date,
          returns_next_due_date: c.returns_next_due_date,
          reg_address_address_line1: c.reg_address_address_line1,
          reg_address_address_line2: c.reg_address_address_line2,
          reg_address_post_town: c.reg_address_post_town,
          reg_address_county: c.reg_address_county,
          reg_address_post_code: c.reg_address_post_code,
        })),
        letterHtmlContent: letterHtmlContent,
        submittedByEmail: currentUserEmail, // Use the fetched currentUserEmail
        targetEmail: 'fabian@lysio.com', // The specified target email address
      };

      const response = await fetch('/api/send-direct-mail-preview-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPreviewPayload),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        console.error("Error from /api/send-direct-mail-preview-email:", result);
        throw new Error(result.error || 'Failed to send preview email via backend. Error: ' + (result.details || 'Unknown error'));
      }

      alert(`Your direct mail preview request for ${directMailRecipientList.length} recipients has been sent to the AccFlow team. They will get back to you within 24 hours.`);
      
      // Update recently contacted numbers (as before, assuming preview email still counts as a contact)
      const newContacted = new Set([...recentlyContactedNumbers, ...directMailRecipientList.map(c => c.company_number)]);
      setRecentlyContactedNumbers(newContacted);
      handleToActionClick(null);
      setDirectMailStep('setQuantity');
      setDirectMailRecipientList([]);
      setMarketingLeadCount(prev => Math.max(0, prev - directMailRecipientList.length)); 
    } catch (error: unknown) { // Changed from any to unknown
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error in direct mail preview email process:", errorMessage); // Use processed message
      alert(`An error occurred while sending the preview email: ${errorMessage || "Please try again."}`);
    } finally {
      setMarketingLoading(false);
      setMarketingProgressMessage('');
    }
  };

  const fetchContactLog = async () => {
    setLoadingContactLog(true);
    setErrorContactLog(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setContactLog([]);
        setErrorContactLog("User not authenticated. Please log in.");
        return;
      }
      const { data, error } = await supabase
        .from('contact_log')
        .select(`
          *,
          companies_house_data:company_number (company_name, reg_address_address_line1, reg_address_post_town, reg_address_post_code, accounts_next_due_date, returns_next_due_date)
        `)
        .eq('user_id', user.id)
        .order('contact_date', { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedLog = data?.map(entry => {
        const chData = entry.companies_house_data as CHDataForContactLog | null; // Applied CHDataForContactLog type
        // Construct a complete ContactLogEntry object, ensuring all fields are present.
        const logEntry: ContactLogEntry = {
          id: entry.id, // Added: Ensure id is mapped
          company_name: chData?.company_name || entry.company_number || 'N/A',
          company_number: entry.company_number,
          accounts_next_due_date: chData?.accounts_next_due_date || null,
          returns_next_due_date: chData?.returns_next_due_date || null,
          reg_address_address_line1: chData?.reg_address_address_line1 || null,
          reg_address_address_line2: chData?.reg_address_address_line2 || null, // Assuming CompanyData might have this
          reg_address_post_town: chData?.reg_address_post_town || null,
          reg_address_county: chData?.reg_address_county || null, // Assuming CompanyData might have this
          reg_address_post_code: chData?.reg_address_post_code || null,
          latitude: chData?.latitude, // Assuming CompanyData might have this
          longitude: chData?.longitude, // Assuming CompanyData might have this
          contact_date: entry.contact_date,
          campaign_type: entry.campaign_type,
          notes: entry.notes,
          target_cities: entry.target_cities,
          letter_html_content: entry.letter_html_content,
        };
        return logEntry;
      }) || [];
      
      setContactLog(formattedLog);
    } catch (e: unknown) { // Changed from any to unknown
      let detailedErrorMessage = "An unknown error occurred while fetching contact log.";
      if (e instanceof Error) {
        detailedErrorMessage = e.message;
        // Attempt to access Supabase specific error properties if they exist
        // These are not standard Error properties, so check for their existence before using
        if (typeof e === 'object' && e !== null) {
            const potentialSupabaseError = e as Error & { details?: string; hint?: string; code?: string }; // Refined type assertion
            if (potentialSupabaseError.details) console.error("Supabase error details:", potentialSupabaseError.details);
            if (potentialSupabaseError.hint) console.error("Supabase error hint:", potentialSupabaseError.hint);
            if (potentialSupabaseError.code) console.error("Supabase error code:", potentialSupabaseError.code);
        }
      } else {
        detailedErrorMessage = String(e);
      }
      console.error("Failed to load contact log (raw error object):", e); 
      setErrorContactLog("Failed to load contact log: " + detailedErrorMessage);
      setContactLog([]);
    } finally {
      setLoadingContactLog(false);
    }
  };

  const handleRemoveContactLogEntry = async (logId: string) => {
    if (!logId) {
      alert("Cannot remove entry: Log ID is missing.");
      return;
    }

    // Optional: Add a confirmation dialog before deleting
    if (!confirm("Are you sure you want to remove this contact log entry? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('contact_log')
        .delete()
        .eq('id', logId);

      if (error) {
        console.error("Error deleting contact log entry:", error);
        throw error; // Throw error to be caught by the catch block
      }

      // Update local state to remove the entry from the UI immediately
      setContactLog(prevLog => prevLog.filter(entry => entry.id !== logId));
      alert("Contact log entry removed successfully.");

    } catch (e: unknown) { // Changed from any to unknown for handleRemoveContactLogEntry
      let detailedErrorMessage = "An unknown error occurred while removing the contact log entry.";
      if (e instanceof Error) {
        detailedErrorMessage = e.message;
      }
      console.error("Failed to remove contact log entry (raw error object):", e);
      alert("Failed to remove contact log entry: " + detailedErrorMessage);
    }
  };

  // Function to render letter preview with dynamic data
  const renderPreviewWithData = () => {
    if (!samplePreviewLead) {
      // Fallback to raw HTML if no sample lead data or if fields are missing
      return letterHtmlContent;
    }
    let processedHtml = letterHtmlContent;
    processedHtml = processedHtml.replace(/{Company Name}/g, samplePreviewLead.company_name || 'N/A');
    processedHtml = processedHtml.replace(/{Accounts Due Date}/g, samplePreviewLead.accounts_next_due_date ? new Date(samplePreviewLead.accounts_next_due_date).toLocaleDateString() : 'N/A');
    processedHtml = processedHtml.replace(/{Confirmation Statement Due Date}/g, samplePreviewLead.returns_next_due_date ? new Date(samplePreviewLead.returns_next_due_date).toLocaleDateString() : 'N/A');
    return processedHtml;
  };

  const handleToActionClick = (actionType: string | null) => {
    setActiveAction(actionType);
    setDirectMailQuantity(marketingLeadCount > 0 ? Math.min(10, marketingLeadCount) : 1);
    setDirectMailStep('setQuantity'); 
    setDirectMailRecipientList([]); // Reset recipient list
    
    // Dynamically generate the initial HTML content with the new template and user email
    const newDynamicInitialHtml = `
<p>Dear Director(s) of {Company Name},</p>

<p>We're writing to remind you that your company has upcoming filing deadlines with Companies House:</p>
<ul style="margin-left: 20px;">
  <li>Accounts Due Date: {Accounts Due Date}</li>
  <li>Confirmation Statement Due Date: {Confirmation Statement Due Date}</li>
</ul>

<p>To avoid any late filing penalties or potential compliance issues, it's important to ensure these are submitted on time.</p>

<p>If we're already assisting with these filings, you don't need to take any further action right now — we'll be in touch if anything is required.</p>
<p>If not, please let us know as soon as possible if you'd like us to handle the filings or if you need any support.</p>

<p>If you have any questions, feel free to get in touch.</p>

<hr style="margin: 20px 0;" />
<p style="font-size: 0.9em;">
  <strong>Contact Us:</strong><br />
  ${currentUserEmail || '[Your Email Address]'} <br />
  {/* You can add more static contact details here if needed, e.g., phone number */}
</p>
`;
    setLetterHtmlContent(newDynamicInitialHtml);

    setEmailCampaignSelected(false);
    setGoogleSearchSelected(false);
    setFacebookInstagramAdsSelected(false);
    setLinkedInAdsSelected(false);
    setSelectedPlan(null);
    setDigitalCampaignBudget(0); // Reset budget

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
    if (!user) { // Ensure user object exists for logging
      alert("User not found. Please log in again.");
      return;
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
        <li><strong>Monthly Ad Spend Budget:</strong> £${digitalCampaignBudget > 0 ? digitalCampaignBudget.toLocaleString() : 'Not specified'}</li>
      </ul>
      <p>This is a request to set up the campaign. Ad spend is not included in the plan price.</p>
      <p>Thank for sending this, someone in out team witll get bakc to you.</p>
    `;

    setMarketingLoading(true); // Add loading state
    setMarketingProgressMessage('Sending campaign request...');

    try {
      // Log the campaign request to contact_log
      const campaignLogEntry = {
        user_id: user.id,
        company_number: null, // Set to null for general campaign requests
        campaign_type: `digital_campaign_request_${selectedPlan || 'custom'}`,
        notes: `Digital campaign request for services: ${selectedServices.join(', ') || 'None'}. Plan: ${planInfo.name}. Potential leads: ${marketingLeadCount}. Budget: £${digitalCampaignBudget > 0 ? digitalCampaignBudget.toLocaleString() : 'N/A'}.`,
        target_cities: selectedMarketingCities.length > 0 ? selectedMarketingCities : null,
        letter_html_content: null, // Explicitly set letter_html_content to null
      };
      const { error: logError } = await supabase.from('contact_log').insert([campaignLogEntry]);

      if (logError) {
        console.error("Error logging digital campaign request:", JSON.stringify(logError, null, 2)); // Improved error logging
        // Proceed with email sending even if logging fails, but notify user / log internally
        alert("Campaign request logged with an error, but proceeding to send email. Please check logs.");
      }

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
    setMarketingLoading(false); // Clear loading state
    setMarketingProgressMessage(''); // Clear progress message
  };

  const handleAddCity = () => {
    const cityToAdd = currentCityInput.trim().toUpperCase();
    if (cityToAdd && !selectedMarketingCities.includes(cityToAdd) && countyOptions.includes(cityToAdd)) {
      setSelectedMarketingCities([...selectedMarketingCities, cityToAdd]);
      setCurrentCityInput('');
    } else if (cityToAdd && !countyOptions.includes(cityToAdd)) {
      alert("County not found in the suggestion list. Please select a valid county from the suggestions.");
    } else if (cityToAdd && selectedMarketingCities.includes(cityToAdd)) {
      alert("County already selected.");
    }
  };

  const handleRemoveCity = (cityToRemove: string) => {
    setSelectedMarketingCities(selectedMarketingCities.filter(city => city !== cityToRemove));
  };

  const renderTakeActionForms = () => {
    if (!activeAction) return null;

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
            {directMailStep === 'setQuantity' && (
              <>
            <div>
              <label htmlFor="directMailQuantitySlider" className="block text-sm font-medium text-gray-700 mb-1">
                    Step 1: Number of letters to send: <span className="font-bold text-indigo-600 text-base">{directMailQuantity.toLocaleString()}</span> (max: {marketingLeadCount.toLocaleString()})
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
                  className="w-full px-4 py-2.5 mt-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
              disabled={marketingLeadCount === 0 || directMailQuantity < 1}
                  onClick={() => {
                    // Fetch recipients when moving to design letter step
                    fetchDirectMailRecipients(); 
                    setDirectMailStep('designLetter');
                  }}
                >
                  Next: Design Letter &rarr;
            </button>
              </>
            )}

            {directMailStep === 'designLetter' && (
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-700 mb-2">Step 2: Design Your Letter Content</h4>
                <div>
                  <label htmlFor="letterHtmlContent" className="block text-sm font-medium text-gray-700 mb-1">
                    Letter HTML (Edit the content below. Stannp will place the address and handle final formatting based on A4 standards.)
                  </label>
                  <textarea
                    id="letterHtmlContent"
                    ref={letterHtmlTextAreaRef}
                    value={letterHtmlContent}
                    onChange={(e) => setLetterHtmlContent(e.target.value)}
                    rows={20}
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                    placeholder="Enter your letter HTML here..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Placeholders like [Company Name] will be replaced with actual data before sending. Click below to insert common fields.
                  </p>
                </div>

                {/* Merge Field Buttons */}
                <div className="pt-2">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Click to Insert Field:</h5>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => insertMergeField('{Company Name}')} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">{`{Company Name}`}</button>
                    <button onClick={() => insertMergeField('{Accounts Due Date}')} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">{`{Accounts Due Date}`}</button>
                    <button onClick={() => insertMergeField('{Confirmation Statement Due Date}')} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">{`{Conf. Stmt Due Date}`}</button>
                    {/* Add more buttons for other common fields if needed */}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-4">
                  <button 
                    onClick={() => setDirectMailStep('setQuantity')}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    &larr; Back to Quantity/Settings
                  </button>
                  <button 
                    className="px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
                    disabled={!letterHtmlContent.trim()} // Removed loadingSampleLead, as it's fetched later
                    onClick={() => setDirectMailStep('previewRecipients')}
                  >
                    Next: Preview Recipients &rarr;
                  </button>
                </div>
              </div>
            )}

            {directMailStep === 'previewRecipients' && (
              <div className="space-y-4">
                <h4 className="text-xl font-semibold text-gray-800 mb-4">Step 3: Review Recipients ({directMailRecipientList.length} Companies)</h4>
                {loading ? ( // Reuse existing loading state for simplicity, or add a new one for recipients
                  <div className="p-3 text-center text-gray-500">Loading recipient list...</div>
                ) : directMailRecipientList.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 bg-yellow-50 rounded-md">No recipients to display. This might happen if all potential leads were recently contacted or are existing clients.</div>
                ) : (
                  <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
                    {directMailRecipientList.map(company => (
                      <div key={company.company_number} className="p-3 bg-white rounded-md shadow-sm border border-gray-100">
                        <p className="font-semibold text-indigo-700 text-sm">{company.company_name || 'N/A'}</p>
                        <p className="text-xs text-gray-500">{company.company_number}</p>
                        <p className="text-xs text-gray-500">
                          {[company.reg_address_address_line1, company.reg_address_post_town, company.reg_address_post_code].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between items-center mt-4">
                  <button 
                    onClick={() => setDirectMailStep('designLetter')}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    &larr; Back to Design Letter
                  </button>
                  <button 
                    className="px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
                    disabled={directMailRecipientList.length === 0 || loadingSampleLead} 
                    onClick={async () => {
                      if (directMailRecipientList.length > 0) { // Only fetch sample if there are recipients
                        await fetchSampleLeadForPreview(directMailRecipientList[0]); // Pass the first recipient as sample
                      }
                      setDirectMailStep('previewAndConfirm');
                    }}
                  >
                    {loadingSampleLead ? 'Loading Preview...' : 'Next: Preview Letter & Confirm Send →'}
                  </button>
                </div>
              </div>
            )}

            {directMailStep === 'previewAndConfirm' && (
              <div className="space-y-6">
                <h4 className="text-xl font-semibold text-gray-800 mb-4">Step 4: Preview & Confirm Your Letter</h4>
                
                {/* Letter Preview Section */}
                <div className="border border-gray-300 rounded-lg p-2 bg-gray-50">
                  <h5 className="text-sm font-medium text-gray-700 mb-2 px-3 pt-2">Letter Content Preview:</h5>
                  {loadingSampleLead ? (
                    <div className="p-3 text-center text-gray-500">Loading live data for preview...</div>
                  ) : (
                    <div 
                      className="prose prose-sm max-w-none p-3 bg-white border border-gray-200 rounded min-h-[200px] overflow-y-auto max-h-[400px]"
                      dangerouslySetInnerHTML={{ __html: renderPreviewWithData() }}
                    />
                  )}
                  <p className="text-xs text-gray-600 mt-2 px-3 pb-2">
                    <strong>Note:</strong> This is a basic preview of your letter&apos;s content. Stannp will handle final formatting, address placement, and A4 conversion.
                  </p>
                </div>

                {/* Campaign Details Summary */}
                <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                  <h5 className="text-md font-semibold text-gray-700 mb-3">Campaign Summary:</h5>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium text-gray-600">Number of letters:</span> {directMailQuantity.toLocaleString()}</p>
                    <p><span className="font-medium text-gray-600">Estimated Cost:</span> £{(directMailQuantity * DIRECT_MAIL_COST_PER_LETTER).toFixed(2)}</p>
                    {selectedMarketingCities.length > 0 && (
                      <p><span className="font-medium text-gray-600">Targeted Counties:</span> {selectedMarketingCities.join(', ')}</p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-3">
                  <button 
                    onClick={() => setDirectMailStep('previewRecipients')}
                    className="w-full sm:w-auto px-6 py-2.5 text-sm bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors duration-150 ease-in-out"
                  >
                    &larr; Back to Review Recipients
                  </button>
                  <button 
                    className="w-full sm:w-auto px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-150 ease-in-out disabled:opacity-70"
                    onClick={handleConfirmAndSendDirectMail} // Function name remains the same, but its internal logic is now changed
                    disabled={directMailRecipientList.length === 0} // Disable if no recipients
                  >
                    Confirm & Send Preview Email
                  </button>
                </div>
              </div>
            )}
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

            {/* ADDED Budget Input Field */}
            <div className="mt-6">
              <h4 className="text-md font-semibold text-gray-700 mb-2">
                {currentRecommendedPlanDetails ? '3. Specify Your Budget (Optional)' : '2. Specify Your Budget (Optional)'}
              </h4>
              <label htmlFor="digitalCampaignBudget" className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Ad Spend Budget (£)
              </label>
              <input
                type="number"
                id="digitalCampaignBudget"
                value={digitalCampaignBudget || ''} // Show empty string if 0 for better placeholder behavior
                onChange={(e) => setDigitalCampaignBudget(parseInt(e.target.value, 10) || 0)}
                placeholder="e.g., 500"
                className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                min="0"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter your desired monthly ad spend. This is separate from any plan management fees.
              </p>
            </div>
            
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

  // useEffect for fetching dashboard statistics
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (loadingClientNumbers) {
        return;
      }
      // Ensure startDate and endDate are valid before fetching, if not, show empty/default for TopCounties
      if (!startDate || !endDate) {
        setDashboardStats({ topCounties: [] });
        setLoadingDashboardStats(false);
        return;
      }

      setLoadingDashboardStats(true);
      try {
        // Use current page filters for the Top Counties query
        let query = supabase
          .from('companies_house_data')
          .select('company_number, reg_address_county, accounts_next_due_date, returns_next_due_date');

        // Apply date and filing type filters from page state
        if (filingTypeFilter === 'accounts') {
          query = query.gte('accounts_next_due_date', startDate)
                       .lte('accounts_next_due_date', endDate);
        } else if (filingTypeFilter === 'confirmation') {
          query = query.gte('returns_next_due_date', startDate)
                       .lte('returns_next_due_date', endDate);
        } else { // 'all' filing types
          query = query.or(
            `and(accounts_next_due_date.gte.${startDate},accounts_next_due_date.lte.${endDate}),` +
            `and(returns_next_due_date.gte.${startDate},returns_next_due_date.lte.${endDate})`
          );
        }

        query = query.eq('company_status', 'Active');

        // Apply county and postcode filters from page state if they exist
        const trimmedCountyFilter = countyFilter.trim();
        if (trimmedCountyFilter) {
          query = query.ilike('reg_address_county', `%${trimmedCountyFilter}%`);
        }
        // Note: Postcode filter is not typically used for a "Top Counties" aggregation but including for consistency if desired.
        // If Top Counties should ignore postcode, this block can be removed.
        const trimmedPostcodeFilter = postcodeFilter.trim();
        if (trimmedPostcodeFilter) {
          query = query.ilike('reg_address_post_code', `%${trimmedPostcodeFilter.replace(/\s+/g, '')}%`);
        }

        if (clientCompanyNumbers && clientCompanyNumbers.size > 0) {
          query = query.not('company_number', 'in', `(${Array.from(clientCompanyNumbers).map(n => `'${n}'`).join(',')})`);
        }

        const { data: leadsData, error: leadsError } = await query;

        if (leadsError) throw leadsError;

        // Client-side filtering for date precision (if needed, Supabase handles dates well usually)
        // For this dynamic Top Counties, we rely on Supabase for date filtering primarily.
        // The `validLeads` will be all leadsData that passed the Supabase query.
        const validLeads = leadsData; // Simplified as Supabase filters are now primary

        const countyCounts: Record<string, number> = {};
        validLeads.forEach(lead => {
          const county = lead.reg_address_county?.trim().toUpperCase();
          if (county && county !== '') {
            countyCounts[county] = (countyCounts[county] || 0) + 1;
          }
        });

        const sortedCounties = Object.entries(countyCounts)
          .map(([county, count]) => ({ county, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5); 

        setDashboardStats({
          topCounties: sortedCounties,
        });

      } catch (e: unknown) { // Changed from any to unknown
        const errorMessage = e instanceof Error ? e.message : String(e); // Handle unknown type
        console.error("Failed to fetch dashboard stats:", errorMessage);
        setDashboardStats({ topCounties: [] });
      } finally {
        setLoadingDashboardStats(false);
      }
    };

    fetchDashboardData();
  }, [clientCompanyNumbers, loadingClientNumbers, startDate, endDate, filingTypeFilter, countyFilter, postcodeFilter]); // Added all relevant page filters as dependencies

  // useEffect to fetch current user's email for the letter template
  useEffect(() => {
    const fetchUserEmail = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && user.email) {
        setCurrentUserEmail(user.email);
      } else if (error) {
        console.error("Error fetching user email for template:", error.message);
      }
    };
    fetchUserEmail();
  }, []);

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
        <nav className="flex space-x-1 bg-indigo-50 p-1 rounded-lg shadow-sm" aria-label="Tabs">
          {(['Lead Engine', 'Campaign Studio', 'Contacted Leads'] as Tab[]).map((tabName) => (
            <button
              key={tabName}
              onClick={() => handleTabChange(tabName)}
              className={`flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-50 ${ 
                activeTab === tabName
                ? 'bg-white text-indigo-700 shadow-md' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-indigo-100'
              }`}
            >
              {tabName === 'Lead Engine' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V15a1 1 0 01-.293.707l-2 2A1 1 0 019 17v-1.586l-3.707-3.707A1 1 0 015 11V3zm2 2v5.586l3 3V7H5z" clipRule="evenodd" />
                </svg>
              )}
              {tabName === 'Campaign Studio' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                  <path d="M12 2.252A8.014 8.014 0 0117.748 12H12V2.252z" />
                </svg>
              )}
              {tabName === 'Contacted Leads' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 4a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2H3zm0 2h14v8H3V6zm3 1a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1A.5.5 0 016 7zm0 3a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5zm0 3a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5zm5-6a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5zm0 3a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5zm0 3a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5z" clipRule="evenodd" />
                </svg>
              )}
              {tabName}
            </button>
          ))}
        </nav>
      </div>
      
      {activeTab === 'Lead Engine' && (
        <div>
          {/* START NEW DASHBOARD SECTION */}
          {loadingDashboardStats && (
            <div className="mb-6 text-center">
              <p className="text-gray-500">Loading key statistics...</p>
              {/* Consider adding a spinner component here for better UX */}
            </div>
          )}
          {!loadingDashboardStats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8"> {/* Grid for 2 cards: Top Counties and Leads in Current Filter */}
              
              {/* Top Counties Card (title and data source will be updated in next step) */}
              {dashboardStats.topCounties.length > 0 ? (
                <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <h3 className="text-base font-medium text-gray-500 truncate">Top Counties (Current Filter)</h3>
                  <ul className="mt-2 space-y-1.5">
                    {dashboardStats.topCounties.slice(0, 3).map(c => (
                      <li key={c.county} className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-gray-700 truncate capitalize">{c.county.toLowerCase()}</span>
                        <span className="text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full text-xs font-medium">{c.count} leads</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                // Show a placeholder or empty state if no top counties and not loading
                !loadingDashboardStats && (
                    <div className="bg-white p-6 rounded-xl shadow-lg flex items-center justify-center">
                        <p className="text-sm text-gray-500">No top county data for current selection.</p>
                    </div>
                )
              )}

              {/* Leads in Current Filter Card */}
              <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300">
                <h3 className="text-base font-medium text-gray-500 truncate">Leads in Current Filter</h3>
                <p className="mt-2 text-4xl font-bold text-indigo-600">
                  {loading ? <span className="text-3xl">...</span> : totalLeads.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1">Matching your filter criteria</p>
              </div>
            </div>
          )}
          {!loadingDashboardStats && dashboardStats.topCounties.length === 0 && (
            // This specific condition for an overall error/empty might need adjustment 
            // if the above individual card handles its empty state well.
            // For now, keeping a general message if loading is done and no counties were found at all.
             <div className="mb-6 p-4 bg-yellow-50 text-yellow-700 rounded-lg text-center">
              <p>Top Counties data is unavailable or no matching leads found.</p>
            </div>
          )}
          {/* END NEW DASHBOARD SECTION */}

          {/* START REVAMPED FILTER SECTION */}
          <div className="mb-8 p-6 border rounded-xl shadow-lg bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-x-6 gap-y-4">
              
              {/* Due Date From */}
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Due Date From</label>
                <input 
                  type="date" 
                  id="start-date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1); // Reset to page 1 on filter change
                  }}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-150 ease-in-out"
                />
              </div>

              {/* Due Date To */}
              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">Due Date To</label>
                <input 
                  type="date" 
                  id="end-date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1); // Reset to page 1 on filter change
                  }}
                  min={startDate} // Prevent end date from being before start date
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-150 ease-in-out"
                />
              </div>
              
              {/* Filing Type Filter */}
              <div>
                <label htmlFor="filing-type-filter" className="block text-sm font-medium text-gray-700 mb-1">Filing Type</label>
                <select
                  id="filing-type-filter"
                  value={filingTypeFilter}
                  onChange={(e) => {
                      setFilingTypeFilter(e.target.value as FilingType);
                      setCurrentPage(1); // Reset to page 1 on filter change
                  }}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-150 ease-in-out bg-white"
                >
                  <option value="all">All Filings</option>
                  <option value="accounts">Accounts Due</option>
                  <option value="confirmation">Confirmation Statements Due</option>
                </select>
              </div>
              
              {/* County Filter */}
              <div>
                <label htmlFor="county-filter" className="block text-sm font-medium text-gray-700 mb-1">County</label>
                <input 
                  type="text" 
                  id="county-filter"
                  value={countyFilter}
                  onChange={(e) => {
                    setCountyFilter(e.target.value);
                    setCurrentPage(1); // Reset to page 1 on filter change
                  }}
                  placeholder="e.g., London, Greater Manchester"
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-150 ease-in-out"
                  list="county-options"
                />
                <datalist id="county-options">
                  {countyOptions.map(county => (
                    <option key={county} value={county} />
                  ))}
                </datalist>
              </div>

              {/* Postcode Filter */}
              <div>
                <label htmlFor="postcode-filter" className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                <input 
                  type="text" 
                  id="postcode-filter"
                  value={postcodeFilter}
                  onChange={(e) => {
                    setPostcodeFilter(e.target.value);
                    setCurrentPage(1); // Reset to page 1 on filter change
                  }}
                  placeholder="e.g., SW1A or EC1"
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-150 ease-in-out"
                />
              </div>

              {/* Placeholder for a potential future filter or a clear button */}
              {/* <div className="flex items-end">
                <button 
                  onClick={() => {
                    setStartDate(new Date().toISOString().split('T')[0]);
                    setEndDate(getInitialEndDate());
                    setFilingTypeFilter('all');
                    setCountyFilter('');
                    setPostcodeFilter('');
                    setCurrentPage(1);
                  }}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150 ease-in-out"
                >
                  Reset Filters
                </button>
              </div> */}
            </div>
          </div>
          {/* END REVAMPED FILTER SECTION */}

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
      
      {activeTab === 'Campaign Studio' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Analyze Local Market Opportunities</h2>
            <p className="text-sm text-gray-600 mb-4">
              Select one or more counties to discover active companies that have filings due within the next 90 days and are not yet your clients in Accflow.
            </p>
            
            <div className="mb-6">
              <label htmlFor="marketing-county-input" className="block text-sm font-medium text-gray-700 mb-1">Add County</label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  id="marketing-county-input"
                  value={currentCityInput}
                  onChange={(e) => setCurrentCityInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCity(); }}}
                  className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Essex, Kent"
                  disabled={marketingLoading}
                  list="county-options-marketing"
                />
                <button 
                  onClick={handleAddCity} 
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  disabled={marketingLoading || !currentCityInput.trim() || !countyOptions.includes(currentCityInput.trim().toUpperCase())}
                >
                  Add
                </button>
              </div>
              <datalist id="county-options-marketing">
                {countyOptions
                  .filter(town => !selectedMarketingCities.includes(town))
                  .map(town => (
                    <option key={town} value={town} />
                ))}
              </datalist>

              {selectedMarketingCities.length > 0 && (
                <div className="mt-3 space-y-2">
                  <h4 className="text-xs font-medium text-gray-500 uppercase">Selected Counties:</h4>
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
                  ) : 'Analyze Lead Potential'}
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
                    {marketingLeadCount.toLocaleString()} potential new clients found!
                  </h3>
                  <p className="text-green-600 mt-1">
                    These are active companies in &quot;{selectedMarketingCities.join(', ')}&quot; with filings due in the next 90 days, which are not currently in your Accflow client list.
                  </p>
                </div>
              
                {/* Step 2: Choose Campaign Type if no action is active yet */}
                {!activeAction && (
                  <div className="mt-8">
                      <h3 className="text-lg font-semibold text-gray-800 mb-1">Step 2: Choose Your Campaign Approach</h3>
                      <p className="text-sm text-gray-600 mb-4">How would you like to reach these potential clients?</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button
                              onClick={() => handleToActionClick('directMail')}
                              className="p-6 border rounded-lg bg-white hover:shadow-lg transition-shadow text-left disabled:opacity-50 flex flex-col items-center justify-center text-center hover:border-indigo-300"
                              disabled={marketingLeadCount === 0}
                          >
                              {/* Icon suggestion: <svg> for a letter/mail */}
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <h4 className="font-semibold text-gray-700 text-lg mb-1">Direct Mail Campaign</h4>
                              <p className="text-sm text-gray-500 mb-3">Reach out via traditional post.</p>
                              <span className="text-sm text-indigo-600 font-medium group-hover:underline">Configure &rarr;</span>
                          </button>
                          <button
                              onClick={() => handleToActionClick('digitalCampaign')}
                              className="p-6 border rounded-lg bg-white hover:shadow-lg transition-shadow text-left disabled:opacity-50 flex flex-col items-center justify-center text-center hover:border-green-300"
                              disabled={marketingLeadCount === 0} 
                          >
                              {/* Icon suggestion: <svg> for digital/ads */}
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <h4 className="font-semibold text-gray-700 text-lg mb-1">Digital Marketing Campaign</h4>
                              <p className="text-sm text-gray-500 mb-3">Launch online ads and email campaigns.</p>
                              <span className="text-sm text-green-600 font-medium group-hover:underline">Select Options &rarr;</span>
                          </button>
                      </div>
                  </div>
                )}
                {/* Step 3: Render configuration forms if an action is active */}
                {activeAction && renderTakeActionForms()} 
              </>
            )}
          </div>
       
      )}

      {activeTab === 'Contacted Leads' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Contact History</h2>
            {loadingContactLog && (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
                <p className="ml-3 text-gray-600">Loading contact history...</p>
              </div>
            )}
            {errorContactLog && (
              <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-lg">Error: {errorContactLog}</div>
            )}
            {!loadingContactLog && !errorContactLog && contactLog.length === 0 && (
              <div className="text-center py-10 bg-gray-50 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.755 4 3.92C16 13.152 14.706 15 12 15c-1.448 0-2.764-.906-3.494-2.147A4.957 4.957 0 008 12.079a4.963 4.963 0 00-.228-1.079zM12 6.079A5.931 5.931 0 006.033 11.05C4.813 12.155 4 13.72 4 15.5C4 18.433 7.582 21 12 21s8-2.567 8-5.5c0-1.78-.813-3.345-2.033-4.45A5.931 5.931 0 0012 6.079z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Contacts Yet</h3>
                <p className="mt-1 text-sm text-gray-500">Your contact history will appear here once you send campaigns.</p>
              </div>
            )}
            {!loadingContactLog && !errorContactLog && contactLog.length > 0 && (
              <div className="overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact Date</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign Type</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {contactLog.map((entry, index) => (
                      <tr key={entry.id || entry.company_number + '-' + entry.contact_date + '-' + index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100 transition-colors duration-150 ease-in-out'}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-semibold text-indigo-700 hover:text-indigo-800">{entry.company_name || 'N/A'}</div>
                          {entry.company_number !== 'N/A' && <div className="text-xs text-gray-500">{entry.company_number}</div>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{new Date(entry.contact_date).toLocaleString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${entry.campaign_type.includes('direct_mail') ? 'bg-blue-100 text-blue-800' : entry.campaign_type.includes('digital_campaign') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {entry.campaign_type.replace(/_/g, ' ').replace('stannp', '(Stannp)').replace(/request/gi, '(Request)').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-md">
                          {entry.target_cities && entry.target_cities.length > 0 && (
                            <div className="text-xs mb-1"><strong className="font-medium text-gray-700">Targeted:</strong> {entry.target_cities.join(', ')}</div>
                          )}
                          {entry.notes && <div className="text-xs italic text-gray-500 truncate" title={entry.notes}>{entry.notes}</div>}
                          {entry.campaign_type.includes('direct_mail') && entry.letter_html_content && (
                            <details className="mt-1.5 text-xs">
                              <summary className="cursor-pointer text-indigo-600 hover:text-indigo-700 hover:underline font-medium">View Letter</summary>
                              <div className="mt-1 p-2 border rounded bg-gray-50 max-h-48 overflow-y-auto text-xs prose prose-xs" dangerouslySetInnerHTML={{ __html: entry.letter_html_content }}></div>
                            </details>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <button 
                            onClick={() => handleRemoveContactLogEntry(entry.id)}
                            className="text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors duration-150 ease-in-out"
                            title="Remove this contact log entry"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}