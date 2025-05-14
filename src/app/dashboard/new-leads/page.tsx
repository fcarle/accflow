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
// import { MarkerClusterGroup } // From dynamic import

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

type Tab = 'List' | 'Custom Save';

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
    if (activeTab === 'List' && selectedSavedSearchId) {
       const pageToUse = currentPage -1;
       const paginatedSlice = filteredLeadsRef.current.slice(pageToUse * ITEMS_PER_PAGE, (pageToUse + 1) * ITEMS_PER_PAGE);
       setLeadCompanies(paginatedSlice);
       // Update totalLeads when custom filter is active and page changes
       setTotalLeads(filteredLeadsRef.current.length);
    } else if (activeTab === 'List' && !selectedSavedSearchId) {
      // When custom filter is cleared, fetchListData will be called by the other useEffect due to selectedSavedSearchId dependency change.
      // It will reset totalLeads correctly.
    }
  }, [currentPage, activeTab, selectedSavedSearchId, specificAccountsDueStartDate, specificAccountsDueEndDate, specificConfirmationStatementStartDate, specificConfirmationStatementEndDate, filteredLeadsRef]); 

  const totalPages = Math.ceil(totalLeads / ITEMS_PER_PAGE);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages || 1, prev + 1)); // Ensure totalPages isn't 0
  };
  
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
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
          {['List', 'Custom Save'].map((tabName) => (
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
                placeholder="e.g., London"
                className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
             />
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
      </div>
    </div>
  );
}