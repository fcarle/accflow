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
import { GeoJSON } from 'leaflet'; 
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'; // For map_area filtering (if existing saved searches are supported)
import distance from '@turf/distance'; // For address_radius filtering
import { point as turfPoint } from '@turf/helpers'; // To create turf points for checks

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

type Tab = 'List' | 'Custom Save' | 'Marketing Growth';

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

interface SavedSearchDefinition {
  type: 'map_area' | 'address_radius';
  geoJson?: GeoJSON.FeatureCollection | GeoJSON.Feature; // For map_area (if supporting existing)
  address?: string; // For address_radius
  radiusKm?: number; // For address_radius
  center?: { lat: number; lng: number }; // For address_radius (geocoded address)
}

interface SavedSearch {
  id: string;
  user_id?: string | null;
  name: string;
  search_type: 'map_area' | 'address_radius'; // Keep 'map_area' if supporting existing
  definition: SavedSearchDefinition; 
  created_at: string;
}

const ITEMS_PER_PAGE = 50;
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiZmFiaWFuY2FybGUiLCJhIjoiY21hZjlmNGVsMDBjZDJvc2ZjYzlscnhobCJ9.ON8A7IynJmbQaE3VGJf6OA';

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

  const geocodeCache = useRef<Record<string, { latitude: number; longitude: number }>>({});

  const [customSearchName, setCustomSearchName] = useState<string>('');
  const [customAddress, setCustomAddress] = useState<string>('');
  const [customRadius, setCustomRadius] = useState<number>(5);
  
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loadingSavedSearches, setLoadingSavedSearches] = useState<boolean>(false);
  const [errorSavedSearches, setErrorSavedSearches] = useState<string | null>(null);

  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<string | null>(null);
  const filteredLeadsRef = useRef<CompanyData[]>([]);

  const [clientCompanyNumbers, setClientCompanyNumbers] = useState<Set<string>>(new Set());
  const [loadingClientNumbers, setLoadingClientNumbers] = useState<boolean>(true);
  const [errorClientNumbers, setErrorClientNumbers] = useState<string | null>(null);

  const [cityFilter, setCityFilter] = useState<string>('');
  const [postTownOptions, setPostTownOptions] = useState<string[]>([]);

  // State for Marketing Growth Tab
  const [currentCityInput, setCurrentCityInput] = useState<string>('');
  const [selectedMarketingCities, setSelectedMarketingCities] = useState<string[]>([]);
  // const [potentialMarketingLeads, setPotentialMarketingLeads] = useState<Pick<CompanyData, 'company_number'>[]>([]); // Store only necessary data
  const [marketingLeadCount, setMarketingLeadCount] = useState<number>(0);
  const [marketingLoading, setMarketingLoading] = useState<boolean>(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);
  const [marketingProgressMessage, setMarketingProgressMessage] = useState<string>('');

  // State for "Take Action" forms
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [directMailQuantity, setDirectMailQuantity] = useState<number>(1);
  const DIRECT_MAIL_COST_PER_LETTER = 1.5;
  const EMAIL_OUTREACH_COST_PER_EMAIL = 1.0;
  const [googleSearchSelected, setGoogleSearchSelected] = useState<boolean>(false);
  const [facebookInstagramAdsSelected, setFacebookInstagramAdsSelected] = useState<boolean>(false);
  const [linkedinAdsSelected, setLinkedInAdsSelected] = useState<boolean>(false);

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

  const fetchSavedSearches = useCallback(async () => {
    setLoadingSavedSearches(true);
    setErrorSavedSearches(null);
    try {
      const { data, error: dbError } = await supabase
        .from('user_saved_searches')
        .select('*')
        .order('created_at', { ascending: false });
      if (dbError) throw dbError;
      setSavedSearches(data || []);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setErrorSavedSearches("Failed to load saved searches. " + errorMessage);
    } finally {
      setLoadingSavedSearches(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedSearches();
    fetchClientCompanyNumbers();

    const fetchPostTowns = async () => {
      try {
        const { data, error } = await supabase
          .from('companies_house_data')
          .select('reg_address_post_town');

        if (error) {
          console.error('Error fetching post towns:', error);
          // Optionally set an error state here
          return;
        }

        if (data) {
          const uniquePostTowns = Array.from(
            new Set(
              data
                .map(item => item.reg_address_post_town)
                .filter(town => town !== null && town.trim() !== '')
                .map(town => town!.toUpperCase()) // Standardize to uppercase
            )
          ).sort();
          setPostTownOptions(uniquePostTowns);
        }
      } catch (e) {
        console.error('Error processing post towns:', e);
        // Optionally set an error state here
      }
    };

    fetchPostTowns();
  }, [fetchSavedSearches, fetchClientCompanyNumbers]);

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
      try {
        let potentialLeads: CompanyData[] = [];
        let totalPotentialLeads = 0;
        
        let queryBuilder; // Use a common variable for the query builder

        if (selectedSavedSearchId) {
          // const selectedSearch = savedSearches.find(s => s.id === selectedSavedSearchId); // This line should be removed or stay commented
          // if (!selectedSearch) throw new Error("Selected saved search not found."); // This line should be removed or stay commented as the check is done with selectedSearchDetails
          
          queryBuilder = supabase
            .from('companies_house_data')
            .select('*, reg_address_address_line1, reg_address_address_line2, reg_address_post_town, reg_address_county, reg_address_post_code');
            // No count needed here as we fetch all and filter client-side for custom geo-searches for now.
            // Date filtering for saved searches is more complex as it happens *after* initial fetch if geo-filtering applies.
            // However, we can pre-filter by the general dates.
          
          queryBuilder = queryBuilder.or(`and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`);

        } else {
          queryBuilder = supabase
            .from('companies_house_data')
            .select('*, reg_address_address_line1, reg_address_address_line2, reg_address_post_town, reg_address_county, reg_address_post_code', { count: 'exact' })
            .or(`and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`);
        }

        // Apply specific Accounts Due Date Filter
        if (specificAccountsDueStartDate && specificAccountsDueEndDate) {
          queryBuilder = queryBuilder
            .gte('accounts_next_due_date', specificAccountsDueStartDate)
            .lte('accounts_next_due_date', specificAccountsDueEndDate);
        }

        // Apply specific Confirmation Statement Due Date Filter
        if (specificConfirmationStatementStartDate && specificConfirmationStatementEndDate) {
          queryBuilder = queryBuilder
            .gte('returns_next_due_date', specificConfirmationStatementStartDate)
            .lte('returns_next_due_date', specificConfirmationStatementEndDate);
        }
        
        queryBuilder = queryBuilder.filter('company_status', 'eq', 'Active');

        if (selectedSavedSearchId) {
          // For saved searches, city filter is applied AFTER geofiltering if applicable
          // If no geofiltering, it can be applied here
           // const selectedSearch = savedSearches.find(s => s.id === selectedSavedSearchId); // This line is unused and will be removed.
           // If saved search is not map_area or address_radius (future proofing), or if it is but city filter is relevant
           if (trimmedCityFilter) {
             queryBuilder = queryBuilder.ilike('reg_address_post_town', `%${trimmedCityFilter}%`);
           }
          const { data: allCompanies, error: allCompaniesError } = await queryBuilder;
          if (allCompaniesError) throw allCompaniesError;

          if (allCompanies && allCompanies.length > 0) {
            potentialLeads = allCompanies.filter(company => !clientCompanyNumbers.has(company.company_number));
            // Geographic filtering (if applicable for the saved search)
            const selectedSearchDetails = savedSearches.find(s => s.id === selectedSavedSearchId);
            if (selectedSearchDetails && (selectedSearchDetails.search_type === 'map_area' || selectedSearchDetails.search_type === 'address_radius')) {
              const geographicallyFilteredCompanies: CompanyData[] = [];
              for (const company of potentialLeads) {
                  let companyLatLng: { latitude: number; longitude: number } | undefined;
                  const cacheKey = company.company_number; 
                  if (geocodeCache.current[cacheKey]) {
                      companyLatLng = geocodeCache.current[cacheKey];
                  } else {
                      const addressParts = [company.reg_address_address_line1, company.reg_address_address_line2, company.reg_address_post_town, company.reg_address_county, company.reg_address_post_code].filter(Boolean).join(', ');
                      if (addressParts.trim()) {
                          try {
                              const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressParts)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;
                              const response = await fetch(geocodeUrl);
                              const geoData = await response.json();
                              if (geoData.features && geoData.features.length > 0) {
                                  const [longitude, latitude] = geoData.features[0].center;
                                  companyLatLng = { latitude, longitude };
                                  geocodeCache.current[cacheKey] = companyLatLng;
                              } 
                        } catch(geoError: unknown) { console.error(`Error geocoding in ListData: ${String(geoError)}`); }
                          await new Promise(resolve => setTimeout(resolve, 50)); 
                      }
                  }
                  if (companyLatLng) {
                      let isMatch = false;
                      const companyPoint = turfPoint([companyLatLng.longitude, companyLatLng.latitude]);
                      if (selectedSearchDetails.search_type === 'map_area' && selectedSearchDetails.definition.geoJson) {
                          try { isMatch = booleanPointInPolygon(companyPoint, selectedSearchDetails.definition.geoJson as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>); } catch (e) { console.error("[TF] PolygonErr", e); }
                      } else if (selectedSearchDetails.search_type === 'address_radius' && selectedSearchDetails.definition.center && selectedSearchDetails.definition.radiusKm) {
                          const centerPoint = turfPoint([selectedSearchDetails.definition.center.lng, selectedSearchDetails.definition.center.lat]);
                          try { const dist = distance(centerPoint, companyPoint, { units: 'kilometers' }); isMatch = dist <= selectedSearchDetails.definition.radiusKm; } catch(e) { console.error("[TF] DistErr", e); }
                      }
                      if (isMatch) {
                          geographicallyFilteredCompanies.push({ ...company, ...companyLatLng });
                      }
                  }
              }
              potentialLeads = geographicallyFilteredCompanies;
            }
          }
          totalPotentialLeads = potentialLeads.length; // Total leads for custom search is the length of the filtered array
        } else {
          // Standard search without a saved custom area
          if (trimmedCityFilter) {
            // queryBuilder = queryBuilder.ilike('reg_address_post_town', `%${trimmedCityFilter}%`); // Temporarily comment out for testing
          }
          queryBuilder = queryBuilder.range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
          
          // console.log("Supabase query object (debug):", queryBuilder); // .toString() might not be helpful, let's see raw object or rely on network tab for URL

          const { data, error: dbError, count } = await queryBuilder;
          if (dbError) {
            console.error("Supabase dbError object (debug):", dbError); // Log the specific Supabase error
            throw dbError;
          }
          if (data) {
            potentialLeads = data.filter(company => !clientCompanyNumbers.has(company.company_number));
          }
          totalPotentialLeads = count ?? 0;
        }

        filteredLeadsRef.current = potentialLeads; 
        setLeadCompanies(potentialLeads.slice(0, ITEMS_PER_PAGE)); 
        setTotalLeads(totalPotentialLeads);
      } catch (e: unknown) {
        console.error("Caught error in fetchListData (Vercel debug):", e);
        if (e && typeof e === 'object' && e !== null) {
          console.error(
            "Error properties (Vercel debug):",
            Object.keys(e).reduce((acc, key) => {
              acc[key] = (e as Record<string, unknown>)[key];
              return acc;
            }, {} as Record<string, unknown>)
          );
        }
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError("Failed to load leads. " + errorMessage);
      } finally {
        setLoading(false);
      }
  }, [startDate, endDate, currentPage, clientCompanyNumbers, loadingClientNumbers, cityFilter, selectedSavedSearchId, savedSearches, geocodeCache, specificAccountsDueStartDate, specificAccountsDueEndDate, specificConfirmationStatementStartDate, specificConfirmationStatementEndDate]);

  const previousDepsRef = useRef({
    startDate: '',
    endDate: '',
    cityFilter: '',
    clientCompanyNumbers: new Set<string>(),
    selectedSavedSearchId: null as string | null,
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
            clientCompanyNumbers,
            selectedSavedSearchId,
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
            prev.clientCompanyNumbers !== currentDeps.clientCompanyNumbers || 
            prev.selectedSavedSearchId !== currentDeps.selectedSavedSearchId ||
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
        if (dependenciesChanged() || leadCompanies.length === 0 && !loading) { // Fetch if deps changed or list is empty and not loading
            fetchListData();
        }
    } else if (activeTab === 'Custom Save') {
      if(loading) setLoading(false);
    }
  }, [
    activeTab, 
    startDate, 
    endDate, 
    cityFilter, 
    clientCompanyNumbers, 
    selectedSavedSearchId, 
    fetchListData, 
    leadCompanies.length, 
    loading,
    specificAccountsDueStartDate,
    specificAccountsDueEndDate,
    specificConfirmationStatementStartDate,
    specificConfirmationStatementEndDate
  ]);

  useEffect(() => {
    if (activeTab === 'List') {
      if (selectedSavedSearchId) {
        // Client-side pagination for saved searches
        const pageToUse = currentPage - 1;
        // Ensure filteredLeadsRef.current is populated before slicing
        // Also, consider if loading is false to prevent slicing stale/empty data during a fetch for the saved search
        if (filteredLeadsRef.current && filteredLeadsRef.current.length > 0) {
            const paginatedSlice = filteredLeadsRef.current.slice(pageToUse * ITEMS_PER_PAGE, (pageToUse + 1) * ITEMS_PER_PAGE);
            setLeadCompanies(paginatedSlice);
            // totalLeads for saved searches should already be set to filteredLeadsRef.current.length
            // when fetchListData (for saved search) completes or selectedSavedSearchId changes.
            // If not, it might need to be set here: setTotalLeads(filteredLeadsRef.current.length);
        } else if (!loading) { 
            setLeadCompanies([]);
            // if filteredLeadsRef is empty and not loading, totalLeads should be 0
            // setTotalLeads(0); // This should be handled by fetchListData or when selectedSavedSearchId changes
        }
      } else {
        // Standard server-side pagination: fetch data for the current page
        fetchListData();
      }
    }
    // Dependencies:
    // - currentPage: to react to page changes.
    // - activeTab: to ensure this logic only runs for the 'List' tab.
    // - selectedSavedSearchId: to differentiate between client-side and server-side pagination.
    // - fetchListData: to ensure the effect re-runs if fetchListData itself changes due to its own dependencies (e.g., date filters),
    //   and because it's called by this effect.
    // - loading: to re-evaluate pagination if loading state changes (e.g. after a fetch for saved search completes)
  }, [currentPage, activeTab, selectedSavedSearchId, fetchListData, loading]); 

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
    }
  };

  const handleSaveCustomSearch = async () => {
    if (!customSearchName.trim()) {
      alert("Please enter a name for your custom search.");
      return;
    }
    if (!customAddress.trim()) {
      alert("Please enter an address for the radius search.");
      return;
    }
    if (!customRadius || customRadius <= 0) {
      alert("Please enter a valid radius (greater than 0 km).");
      return;
    }

    let centerCoords: { lat: number; lng: number } | undefined = undefined;
    const cachedAddressKey = customAddress.toLowerCase().trim();
    if (geocodeCache.current[cachedAddressKey]) {
      centerCoords = { lat: geocodeCache.current[cachedAddressKey].latitude, lng: geocodeCache.current[cachedAddressKey].longitude };
    } else {
      try {
        setLoading(true);
        const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(customAddress)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;
        const response = await fetch(geocodeUrl);
        const geoData = await response.json();
        if (geoData.features && geoData.features.length > 0) {
          const [longitude, latitude] = geoData.features[0].center;
          centerCoords = { lat: latitude, lng: longitude };
          geocodeCache.current[cachedAddressKey] = { latitude, longitude };
        } else {
          alert("Could not geocode the provided address. Please check it and try again.");
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Error geocoding address for saved search:", e);
        alert("An error occurred while geocoding the address.");
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }
    
    const searchDefinition: SavedSearchDefinition = {
      type: 'address_radius',
      address: customAddress,
      radiusKm: customRadius,
      center: centerCoords
    };

    try {
      setLoading(true);
      const { error: insertError } = await supabase
        .from('user_saved_searches')
        .insert({
          name: customSearchName,
          search_type: 'address_radius',
          definition: searchDefinition, 
        });
      if (insertError) throw insertError;
      alert('Custom search saved successfully!');
      fetchSavedSearches();
      setCustomSearchName('');
      setCustomAddress('');
      setCustomRadius(5);
    } catch (e: unknown) {
      console.error("Error saving custom search:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      alert("Failed to save custom search: " + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSavedSearch = async (searchId: string, searchName: string) => {
    if (!window.confirm(`Are you sure you want to delete the saved search "${searchName}"?`)) {
      return;
    }
    try {
      const { error: deleteError } = await supabase
        .from('user_saved_searches')
        .delete()
        .eq('id', searchId);
      if (deleteError) throw deleteError;
      fetchSavedSearches();
      if (selectedSavedSearchId === searchId) {
         setSelectedSavedSearchId(null);
         setCurrentPage(1); // Reset to page 1 when active filter is deleted
      }
    } catch (e: unknown) {
      console.error("Error deleting saved search:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      alert("Failed to delete saved search: " + errorMessage);
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
      const oneMonthLater = new Date();
      oneMonthLater.setDate(today.getDate() + 30);
      const queryStartDate = today.toISOString().split('T')[0];
      const queryEndDate = oneMonthLater.toISOString().split('T')[0];

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
             setMarketingError(`No new leads found in the selected cities with filings due in the next 30 days.`);
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

  const handleToActionClick = (actionType: string) => {
    setActiveAction(actionType);
    if (actionType === 'directMail') {
      // Initialize directMailQuantity based on marketingLeadCount, ensuring it's at least 1 if leads are present
      setDirectMailQuantity(marketingLeadCount > 0 ? Math.min(10, marketingLeadCount) : 1); // Default to 10 or max leads, min 1
    }
    // Reset other form-specific states if necessary when switching actions
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

    const costToShow = (cost: number) => cost.toFixed(2);
    const roundToWhole = (num: number) => Math.round(num);

    // Define strategy options here to make JSX cleaner
    const displayCitiesString = selectedMarketingCities.length > 0 ? selectedMarketingCities.join(', ') : 'your target area';
    const strategyOptions = [
      { id: 'googleSearchAds', checked: googleSearchSelected, setter: setGoogleSearchSelected, title: 'Google Search Ads', description: `Boost visibility when clients in "${displayCitiesString}" search on Google.` },
      { id: 'socialMediaAds', checked: facebookInstagramAdsSelected, setter: setFacebookInstagramAdsSelected, title: 'Facebook & Instagram Ads', description: `Target individuals and businesses on social media in the "${displayCitiesString}" area.` },
      { id: 'linkedinAds', checked: linkedinAdsSelected, setter: setLinkedInAdsSelected, title: 'LinkedIn Ads', description: `Reach professionals and companies in "${displayCitiesString}" on LinkedIn.` },
    ];

    return (
      <div className="mt-6 p-6 bg-white border border-gray-200 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-indigo-700">
            {activeAction === 'directMail' && 'Direct Mail Campaign Setup'}
            {activeAction === 'emailOutreach' && 'Email Outreach Setup'}
            {activeAction === 'personalizedStrategy' && 'Personalized Strategy Options'}
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
              <p className="text-sm text-indigo-800"><span className="font-semibold">Cost per letter:</span> £{costToShow(DIRECT_MAIL_COST_PER_LETTER)}</p>
              <p className="text-lg font-bold text-indigo-900">
                Total Estimated Cost: £{costToShow(directMailQuantity * DIRECT_MAIL_COST_PER_LETTER)}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                Industry average response rates for direct mail can be 2-9%. Assuming ~7% for projection:
              </p>
              <p className="text-md font-semibold text-gray-800">
                Estimated Responses: <span className="text-green-600">{roundToWhole(directMailQuantity * 0.07)}</span>
              </p>
            </div>
            <button 
              className="w-full px-4 py-2.5 mt-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
              disabled={marketingLeadCount === 0 || directMailQuantity < 1}
              onClick={() => alert(`Proceeding with Direct Mail for ${directMailQuantity} letters. (Integration needed)`)}
            >
              Confirm Campaign (Cost: £{costToShow(directMailQuantity * DIRECT_MAIL_COST_PER_LETTER)})
            </button>
          </div>
        )}

        {activeAction === 'emailOutreach' && (
          <div className="space-y-5">
            <div className="p-5 bg-indigo-50 rounded-xl shadow">
              <div className="mb-3">
                <p className="text-sm text-indigo-700 font-medium">Potential leads identified:</p>
                <p className="text-2xl font-bold text-indigo-900">{marketingLeadCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-indigo-700 font-medium">Est. Total Cost for Email Contacts:</p>
                <p className="text-2xl font-bold text-indigo-900">£{costToShow(marketingLeadCount * EMAIL_OUTREACH_COST_PER_EMAIL)}</p>
                <p className="text-xs text-indigo-600 mt-1">(Based on £{costToShow(EMAIL_OUTREACH_COST_PER_EMAIL)} per email contact)</p>
              </div>
            </div>

            <div className="p-5 bg-gray-50 rounded-xl shadow">
              <p className="text-sm text-gray-700 font-medium mb-1">Performance Projection:</p>
              <p className="text-md font-semibold text-gray-800">
                Estimated Responses (at 5%): <span className="text-2xl font-bold text-green-600">{roundToWhole(marketingLeadCount * 0.05)}</span>
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Email campaign response rates can vary significantly (often 1-5%). Actual responses depend on email quality, offer, and precise targeting.
              </p>
            </div>

            <p className="text-xs text-gray-600 py-2 px-1 text-center">
              Note: This provides an estimated cost to attempt to acquire email contacts. Actual number of emails found and final cost may vary.
            </p>

            <button 
              className="w-full px-4 py-3 mt-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 transition-colors text-base"
              disabled={marketingLeadCount === 0}
              onClick={() => alert(`Requesting email list for ${marketingLeadCount} contacts. (Integration needed)`)}
            >
              Attempt to Acquire Email Contacts (Est. Cost: £{costToShow(marketingLeadCount * EMAIL_OUTREACH_COST_PER_EMAIL)})
            </button>
          </div>
        )}

        {activeAction === 'personalizedStrategy' && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600 mb-3">
              Select the digital strategies you&apos;re interested in exploring. Our growth team will then contact you for a personalized consultation.
            </p>
            {strategyOptions.map(strategy => (
              <div key={strategy.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-start">
                  <input 
                    id={strategy.id} type="checkbox" className="h-5 w-5 text-indigo-600 border-gray-300 rounded mt-1 focus:ring-indigo-500 cursor-pointer"
                    checked={strategy.checked} onChange={(e) => strategy.setter(e.target.checked)} 
                  />
                  <div className="ml-3 flex-grow">
                    <label htmlFor={strategy.id} className="font-semibold text-gray-800 cursor-pointer">{strategy.title}</label>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {strategy.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <button 
              className="w-full px-4 py-2.5 mt-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 transition-colors"
              onClick={() => alert(`Requesting consultation for selected strategies. (Integration needed)`)}
              disabled={!googleSearchSelected && !facebookInstagramAdsSelected && !linkedinAdsSelected}
            >
              Request Consultation
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loadingClientNumbers && activeTab !== 'Custom Save') {
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
          {['List', 'Custom Save', 'Marketing Growth'].map((tabName) => (
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
             <label htmlFor="city-filter" className="block text-sm font-medium text-gray-700 mb-1">City</label>
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
            <label htmlFor="saved-search-filter" className="block text-sm font-medium text-gray-700 mb-1">Custom Area Filter</label>
            <select
              id="saved-search-filter"
              value={selectedSavedSearchId || ''}
              onChange={(e) => {
                setSelectedSavedSearchId(e.target.value || null);
                setCurrentPage(1);
              }}
              className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              disabled={activeTab !== 'List'} // Disable if not on List tab
            >
              <option value="">All Locations</option>
              {savedSearches.map(search => (
                <option key={search.id} value={search.id}>{search.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        {activeTab === 'List' && (
          <div>
            {loading && (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            )}
            {error && <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">{error}</div>}
            {!loading && !error && leadCompanies.length === 0 && (
              <div className="bg-gray-50 p-8 rounded-xl text-center">
                <p className="text-gray-600">No companies found matching the criteria{selectedSavedSearchId ? ' for the selected custom filter' : ''} in the date range.</p>
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
        
        {activeTab === 'Custom Save' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Create New Custom Search</h2>
              <div className="space-y-5">
                <div>
                  <label htmlFor="custom-search-name" className="block text-sm font-medium text-gray-700 mb-1">Search Name</label>
                  <input 
                    type="text" 
                    id="custom-search-name"
                    value={customSearchName}
                    onChange={(e) => setCustomSearchName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., My North London Area"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Type</label>
                  <div className="flex space-x-4">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio text-indigo-600"
                        name="search-type"
                        value="address_radius"
                        checked={true} // Should always be checked
                        readOnly 
                      />
                      <span className="ml-2">Address Radius</span>
                    </label>
                  </div>
                </div>

                {true && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="custom-address" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input 
                        type="text" 
                        id="custom-address"
                        value={customAddress}
                        onChange={(e) => setCustomAddress(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., 123 Main St, London"
                      />
                    </div>
                    <div>
                      <label htmlFor="custom-radius" className="block text-sm font-medium text-gray-700 mb-1">Radius (km)</label>
                      <input 
                        type="number"
                        id="custom-radius"
                        value={customRadius}
                        onChange={(e) => setCustomRadius(Number(e.target.value))}
                        min="1"
                        max="50" // You can adjust max radius if needed
                        className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button 
                    onClick={handleSaveCustomSearch}
                    disabled={!customSearchName || !customAddress || !customRadius || customRadius <= 0 || loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Saving...' : 'Save Custom Search'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Saved Searches</h2>
              {loadingSavedSearches && (
                <div className="flex justify-center items-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
              )}
              {errorSavedSearches && <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">{errorSavedSearches}</div>}
              
              {!loadingSavedSearches && !errorSavedSearches && savedSearches.length === 0 && (
                <p className="text-gray-600 py-4">No saved searches yet. Create one above.</p>
              )}
              
              {!loadingSavedSearches && !errorSavedSearches && savedSearches.length > 0 && (
                <ul className="space-y-3">
                  {savedSearches.map(search => (
                    <li key={search.id} className="p-4 border border-gray-200 rounded-lg flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-gray-800">{search.name}</h3>
                        <p className="text-sm text-gray-600">
                          {search.search_type === 'map_area' ? 'Map Area (Legacy)' : 'Address Radius'} {/* Clarify legacy map areas */}
                          {search.search_type === 'address_radius' && search.definition.address && 
                            `: ${search.definition.address} (${search.definition.radiusKm}km)`
                          }
                           {search.search_type === 'map_area' && <span className="text-xs text-gray-500"> (Cannot create new map areas)</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteSavedSearch(search.id, search.name)}
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete this saved search"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Marketing Growth' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Analyze Local Market Opportunities</h2>
              <p className="text-sm text-gray-600 mb-4">
                Select one or more cities to discover active companies that have filings due within the next 30 days and are not yet your clients in Accflow.
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
                      These are active companies in &quot;{selectedMarketingCities.join(', ')}&quot; with filings due in the next 30 days, which are not currently in your Accflow client list.
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
                                onClick={() => handleToActionClick('emailOutreach')}
                                className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left disabled:opacity-50"
                                disabled={marketingLeadCount === 0} 
                            >
                                <h4 className="font-medium text-gray-700 mb-2">Email Outreach</h4>
                                <p className="text-sm text-gray-600 mb-3">Consider an email campaign.</p>
                                <span className="text-sm text-indigo-600 font-medium">Explore &rarr;</span>
                            </button>
                            <button
                                onClick={() => handleToActionClick('personalizedStrategy')}
                                className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                            >
                                <h4 className="font-medium text-gray-700 mb-2">Personalized Strategy</h4>
                                <p className="text-sm text-gray-600 mb-3">Want help crafting the perfect approach?</p>
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
    </div>
  );
}