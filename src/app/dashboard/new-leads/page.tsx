'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import 'leaflet/dist/leaflet.css'; // Import Leaflet CSS
import 'leaflet-draw/dist/leaflet.draw.css'; // CSS for leaflet-draw
import { MapContainer, TileLayer, Marker, Popup, FeatureGroup, useMap } from 'react-leaflet';
import L, { LatLngExpression, LeafletEvent, GeoJSON } from 'leaflet'; // Added LeafletEvent, GeoJSON
import { EditControl } from 'react-leaflet-draw'; // For drawing
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'; // For map_area filtering
import distance from '@turf/distance'; // For address_radius filtering
import { point as turfPoint } from '@turf/helpers'; // To create turf points for checks

// Fix for default Leaflet marker icon issue with webpack
// You might need to copy marker-icon.png, marker-icon-2x.png, and marker-shadow.png
// to your public folder and adjust paths if they don't load correctly.
// For now, trying a common fix:
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

type Tab = 'List' | 'Map View' | 'Custom Save';

interface CompanyData {
  company_name: string | null;
  company_number: string;
  accounts_next_due_date: string | null;
  returns_next_due_date: string | null;
  // For map view, we'll add address components and potentially lat/lng
  reg_address_address_line1?: string | null;
  reg_address_address_line2?: string | null;
  reg_address_post_town?: string | null;
  reg_address_county?: string | null;
  reg_address_post_code?: string | null;
  latitude?: number;
  longitude?: number;
}

// Interface for saved searches
interface SavedSearchDefinition {
  type: 'map_area' | 'address_radius';
  geoJson?: GeoJSON.FeatureCollection | GeoJSON.Feature; // For map_area
  address?: string; // For address_radius
  radiusKm?: number; // For address_radius
  center?: { lat: number; lng: number }; // For address_radius (geocoded address)
}

interface SavedSearch {
  id: string;
  user_id?: string | null; // Assuming nullable for now if no auth
  name: string;
  search_type: 'map_area' | 'address_radius';
  definition: SavedSearchDefinition; 
  created_at: string;
}

const ITEMS_PER_PAGE = 50;
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiZmFiaWFuY2FybGUiLCJhIjoiY21hZjlmNGVsMDBjZDJvc2ZjYzlscnhobCJ9.ON8A7IynJmbQaE3VGJf6OA';

export default function NewLeadsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('List');
  const [loading, setLoading] = useState<boolean>(true); // Covers both list and map loading initially
  const [error, setError] = useState<string | null>(null);
  
  // State for List View
  const [leadCompanies, setLeadCompanies] = useState<CompanyData[]>([]);
  const getInitialEndDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
  };
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(getInitialEndDate());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalLeads, setTotalLeads] = useState<number>(0);

  // State for Map View
  const [mapCompanies, setMapCompanies] = useState<CompanyData[]>([]);
  const [mapLoading, setMapLoading] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([51.505, -0.09]); // Default center (London)
  const [mapZoom, setMapZoom] = useState<number>(6); // Default zoom
  const [mapLoadingStage, setMapLoadingStage] = useState<'fetching' | 'geocoding' | 'idle'>('idle'); // New state for loading stage
  const geocodeCache = useRef<Record<string, { latitude: number; longitude: number }>>({});
  const mapRef = useRef<L.Map | null>(null); // Ref for the map instance

  // State for "Custom Save" tab
  const [customSearchName, setCustomSearchName] = useState<string>('');
  const [customSearchType, setCustomSearchType] = useState<'map_area' | 'address_radius'>('map_area');
  const [customAddress, setCustomAddress] = useState<string>('');
  const [customRadius, setCustomRadius] = useState<number>(5); // Default 5km
  const [isDrawingForCustomSearch, setIsDrawingForCustomSearch] = useState<boolean>(false);
  const [drawnShapeData, setDrawnShapeData] = useState<GeoJSON.FeatureCollection | GeoJSON.Feature | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup>(null); // To access drawn layers

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loadingSavedSearches, setLoadingSavedSearches] = useState<boolean>(false);
  const [errorSavedSearches, setErrorSavedSearches] = useState<string | null>(null);

  // Ref to manage the currently drawn layer if we need to remove it before drawing a new one
  const currentDrawnLayerRef = useRef<L.Layer | null>(null);

  // New state for list filtering
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<string | null>(null);
  // Ref to store the fully filtered list when using custom search (for client-side pagination)
  const filteredLeadsRef = useRef<CompanyData[]>([]);

  // New state for user's client company numbers
  const [clientCompanyNumbers, setClientCompanyNumbers] = useState<Set<string>>(new Set());
  const [loadingClientNumbers, setLoadingClientNumbers] = useState<boolean>(true);
  const [errorClientNumbers, setErrorClientNumbers] = useState<string | null>(null);

  // New state for city filter
  const [cityFilter, setCityFilter] = useState<string>('');

  // Fetch User's Client Company Numbers
  const fetchClientCompanyNumbers = useCallback(async () => {
    setLoadingClientNumbers(true);
    setErrorClientNumbers(null);
    console.log("[ClientsFilter] Fetching client company numbers...");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.warn("[ClientsFilter] User not logged in, cannot fetch client numbers.");
        setClientCompanyNumbers(new Set()); // Ensure it's an empty set if no user
        return; // Exit if no user
      }

      const { data, error: dbError } = await supabase
        .from('clients')
        .select('company_number')
        .eq('created_by', user.id)
        .not('company_number', 'is', null); // Ignore clients without a company number

      if (dbError) {
        console.error("[ClientsFilter] Error fetching client numbers:", dbError);
        throw dbError;
      }

      const numbers = new Set(data?.map(client => client.company_number).filter(Boolean) || []);
      console.log(`[ClientsFilter] Found ${numbers.size} client company numbers for user ${user.id}.`);
      setClientCompanyNumbers(numbers);

    } catch (e: any) {
      console.error("[ClientsFilter] Error in fetchClientCompanyNumbers:", e);
      setErrorClientNumbers("Failed to load client list for filtering: " + e.message);
      setClientCompanyNumbers(new Set()); // Reset on error
    } finally {
      setLoadingClientNumbers(false);
    }
  }, []);

  // Fetch existing saved searches
  const fetchSavedSearches = useCallback(async () => {
    setLoadingSavedSearches(true);
    setErrorSavedSearches(null);
    console.log("[CustomSave] Fetching saved searches..."); // Log: Start fetching
    try {
      const { data, error: dbError } = await supabase
        .from('user_saved_searches')
        .select('*')
        .order('created_at', { ascending: false });

      if (dbError) {
        console.error("[CustomSave] Supabase error fetching saved searches:", dbError); // Log: DB Error
        throw dbError;
      }
      console.log("[CustomSave] Fetched data from Supabase:", data); // Log: Raw data from Supabase
      setSavedSearches(data || []);
    } catch (e: any) {
      console.error("[CustomSave] Error in fetchSavedSearches catch block:", e); // Log: Catch block error
      setErrorSavedSearches("Failed to load saved searches. " + e.message);
    } finally {
      setLoadingSavedSearches(false);
      console.log("[CustomSave] Finished fetching saved searches."); // Log: Finish fetching
    }
  }, []);

  // Add a useEffect to log when savedSearches state changes
  useEffect(() => {
    console.log("[CustomSave] savedSearches state updated:", savedSearches);
  }, [savedSearches]);

  // Fetch saved searches once on initial mount
  useEffect(() => {
    fetchSavedSearches();
    fetchClientCompanyNumbers(); // Fetch client numbers on mount too
  }, [fetchSavedSearches, fetchClientCompanyNumbers]); // Add new dependency

  useEffect(() => {
    const fetchListData = async () => {
      if (loadingClientNumbers) return; // Wait for client numbers to load before fetching leads

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
      const page = currentPage -1;
      const trimmedCityFilter = cityFilter.trim(); // Trim city filter

      try {
        let potentialLeads: CompanyData[] = [];
        let totalPotentialLeads = 0;

        if (selectedSavedSearchId) {
          const selectedSearch = savedSearches.find(s => s.id === selectedSavedSearchId);
          if (!selectedSearch) throw new Error("Selected saved search not found.");
          
          let query = supabase
            .from('companies_house_data')
            .select('*, reg_address_address_line1, reg_address_address_line2, reg_address_post_town, reg_address_county, reg_address_post_code')
            .or(
              `and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`
            )
            .filter('company_status', 'eq', 'Active');

          if (trimmedCityFilter) {
            query = query.ilike('reg_address_post_town', `%${trimmedCityFilter}%`);
          }

          const { data: allCompanies, error: allCompaniesError } = await query;

          if (allCompaniesError) throw allCompaniesError;

          if (!allCompanies || allCompanies.length === 0) {
             potentialLeads = [];
          } else {
              potentialLeads = allCompanies.filter(company => 
                  !clientCompanyNumbers.has(company.company_number)
              );
              console.log(`[ListFilter] ${allCompanies.length - potentialLeads.length} companies removed as existing clients.`);
              
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
                          } catch(geoError) {
                              console.error(`[ListFilter] Error geocoding company ${company.company_number}:`, geoError);
                          }
                          await new Promise(resolve => setTimeout(resolve, 50)); 
                      }
                  }

                  if (companyLatLng) {
                      let isMatch = false;
                      const companyPoint = turfPoint([companyLatLng.longitude, companyLatLng.latitude]);
                      if (selectedSearch.search_type === 'map_area' && selectedSearch.definition.geoJson) {
                          try { isMatch = booleanPointInPolygon(companyPoint, selectedSearch.definition.geoJson as any); } catch (e) { console.error("[TF] PolygonErr", e); }
                      } else if (selectedSearch.search_type === 'address_radius' && selectedSearch.definition.center && selectedSearch.definition.radiusKm) {
                          const centerPoint = turfPoint([selectedSearch.definition.center.lng, selectedSearch.definition.center.lat]);
                          try { const dist = distance(centerPoint, companyPoint, { units: 'kilometers' }); isMatch = dist <= selectedSearch.definition.radiusKm; } catch(e) { console.error("[TF] DistErr", e); }
                      }
                      if (isMatch) {
                          geographicallyFilteredCompanies.push({ ...company, ...companyLatLng });
                      }
                  }
              }
              potentialLeads = geographicallyFilteredCompanies;
          }
          totalPotentialLeads = potentialLeads.length;
          filteredLeadsRef.current = potentialLeads;
          const paginatedSlice = potentialLeads.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
          setLeadCompanies(paginatedSlice);
          setTotalLeads(totalPotentialLeads);

        } else {
          filteredLeadsRef.current = []; 
          
          let countQuery = supabase
            .from('companies_house_data')
            .select('*' , { count: 'exact', head: true })
            .or(
              `and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`
            )
            .filter('company_status', 'eq', 'Active');

          if (trimmedCityFilter) {
             countQuery = countQuery.ilike('reg_address_post_town', `%${trimmedCityFilter}%`);
          }
          const { count, error: countError } = await countQuery;
          if (countError) throw countError;
          const unfilteredCount = count || 0; 

          let dataQuery = supabase
            .from('companies_house_data')
            .select('company_name, company_number, accounts_next_due_date, returns_next_due_date, reg_address_address_line1, reg_address_post_town, reg_address_post_code')
            .or(
              `and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`
            )
            .filter('company_status', 'eq', 'Active');

          if (trimmedCityFilter) {
            dataQuery = dataQuery.ilike('reg_address_post_town', `%${trimmedCityFilter}%`);
          }
          dataQuery = dataQuery.range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
          const { data, error: dbError } = await dataQuery;

          if (dbError) throw dbError;

          let finalLeads: CompanyData[] = [];
          if (data) {
            const nonClientLeads = data.filter(company => 
                !clientCompanyNumbers.has(company.company_number)
            );
            
            finalLeads = nonClientLeads.map(company => ({
              ...company,
              accounts_next_due_date: company.accounts_next_due_date && !isNaN(new Date(company.accounts_next_due_date).getTime()) ? company.accounts_next_due_date : null,
              returns_next_due_date: company.returns_next_due_date && !isNaN(new Date(company.returns_next_due_date).getTime()) ? company.returns_next_due_date : null,
            }));
          }
          setLeadCompanies(finalLeads as CompanyData[]);
          setTotalLeads(unfilteredCount);
        }
      } catch (e: any) {
        console.error("Error fetching list lead companies:", e);
        setError("Failed to load new leads for list. " + e.message);
        setLeadCompanies([]);
        setTotalLeads(0);
        filteredLeadsRef.current = [];
      } finally {
        setLoading(false);
      }
    };

    const fetchMapDataAndGeocode = async () => {
       if (loadingClientNumbers) return; // Wait for client numbers
       
       if (!startDate || !endDate) {
         setMapCompanies([]);
         setMapLoading(false);
         setMapLoadingStage('idle');
         return;
       }
       setMapLoading(true);
       setMapError(null);
       setMapLoadingStage('fetching');
       
       const lowerBoundDateQuery = startDate;
       const upperBoundDateQuery = endDate;
       const trimmedCityFilter = cityFilter.trim(); // Trim city filter

       try {
         let query = supabase
           .from('companies_house_data')
           .select('*, reg_address_address_line1, reg_address_address_line2, reg_address_post_town, reg_address_county, reg_address_post_code')
           .or(
             `and(accounts_next_due_date.gte.${lowerBoundDateQuery},accounts_next_due_date.lte.${upperBoundDateQuery}),and(returns_next_due_date.gte.${lowerBoundDateQuery},returns_next_due_date.lte.${upperBoundDateQuery})`
           )
           .filter('company_status', 'eq', 'Active');

         if (trimmedCityFilter) {
            query = query.ilike('reg_address_post_town', `%${trimmedCityFilter}%`);
         }
         
         const { data: companiesFromDb, error: dbError } = await query;

         if (dbError) throw dbError;
         
         setMapLoadingStage('geocoding');

         const newMapCompanies: CompanyData[] = [];
         if (companiesFromDb && companiesFromDb.length > 0) {
           const potentialMapLeads = companiesFromDb.filter(company => 
               !clientCompanyNumbers.has(company.company_number)
           );
           console.log(`[MapFilter] ${companiesFromDb.length - potentialMapLeads.length} companies removed as existing clients.`);

           for (const company of potentialMapLeads) {
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
                     } catch(geoError) {
                         console.error(`Error geocoding address for company ${company.company_name}: ${geoError}`);
                     }
                     await new Promise(resolve => setTimeout(resolve, 200)); 
                 }
             }
             
             if (companyLatLng) {
                newMapCompanies.push({ ...company, ...companyLatLng });
             }
           }
         }
         setMapCompanies(newMapCompanies);
         if (newMapCompanies.length > 0) {
            const firstValidCompany = newMapCompanies.find(c => c.latitude && c.longitude);
            if (firstValidCompany && firstValidCompany.latitude && firstValidCompany.longitude) {
                 setMapCenter([firstValidCompany.latitude, firstValidCompany.longitude]);
                 setMapZoom(10);
            }
          }

       } catch (e: any) {
         console.error("Error fetching or geocoding map data:", e);
         setMapError("Failed to load or geocode map data. " + e.message);
       } finally {
         setMapLoading(false);
         setMapLoadingStage('idle');
       }
    };

    if (activeTab === 'List') {
      if(mapLoading) setMapLoading(false); // Stop map loading if switching to list
      fetchListData();
    } else if (activeTab === 'Map View') {
      if(loading) setLoading(false); // Stop list loading if switching to map
      fetchMapDataAndGeocode();
    } else if (activeTab === 'Custom Save') {
      if(loading) setLoading(false);
      if(mapLoading) setMapLoading(false);
      // Saved searches are fetched on mount
    }
  }, [activeTab, startDate, endDate, currentPage, selectedSavedSearchId, savedSearches, clientCompanyNumbers, loadingClientNumbers, cityFilter]); // Added cityFilter dependency

  // Effect for client-side pagination when using custom filter
  useEffect(() => {
    if (activeTab === 'List' && selectedSavedSearchId) {
       // When page changes and a custom filter is active, re-slice the stored full list
       const page = currentPage - 1;
       const paginatedSlice = filteredLeadsRef.current.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
       setLeadCompanies(paginatedSlice);
    }
     // No need to re-run if selectedSavedSearchId becomes null, the main effect handles that.
  }, [currentPage, activeTab, selectedSavedSearchId]); 

  const totalPages = Math.ceil(totalLeads / ITEMS_PER_PAGE);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };
  
  const handleTabChange = (tab: Tab) => {
    setIsDrawingForCustomSearch(false); // Stop drawing mode when switching tabs
    setActiveTab(tab);
  };

  // --- Handlers for Custom Save Drawing ---
  const handleDefineAreaOnMap = () => {
    setDrawnShapeData(null); // Clear previous shape
    if (currentDrawnLayerRef.current && featureGroupRef.current) {
        featureGroupRef.current.removeLayer(currentDrawnLayerRef.current);
        currentDrawnLayerRef.current = null;
    }
    setIsDrawingForCustomSearch(true);
    setActiveTab('Map View'); // Switch to map to draw
  };

  const handleConfirmDrawnArea = () => {
    setIsDrawingForCustomSearch(false);
    // drawnShapeData should already be set by _onCreated
    setActiveTab('Custom Save'); // Switch back to custom save form
  };
  
  const _onCreated = (e: LeafletEvent & { layer: L.Layer & { toGeoJSON: () => GeoJSON.Feature | GeoJSON.FeatureCollection }}) => {
    if (featureGroupRef.current) {
        if (currentDrawnLayerRef.current) {
            featureGroupRef.current.removeLayer(currentDrawnLayerRef.current);
        }
        const drawnLayer = e.layer;
        featureGroupRef.current.addLayer(drawnLayer);
        currentDrawnLayerRef.current = drawnLayer;
        setDrawnShapeData(drawnLayer.toGeoJSON());
        // console.log("Shape drawn:", drawnLayer.toGeoJSON()); // Keep for debugging if needed
    }
  };

  const handleSaveCustomSearch = async () => {
    if (!customSearchName.trim()) {
      alert("Please enter a name for your custom search.");
      return;
    }

    let searchDefinition: SavedSearchDefinition;

    if (customSearchType === 'map_area') {
      if (!drawnShapeData) {
        alert("Please define an area on the map first.");
        return;
      }
      searchDefinition = {
        type: 'map_area',
        geoJson: drawnShapeData
      };
    } else { // address_radius
      if (!customAddress.trim()) {
        alert("Please enter an address for the radius search.");
        return;
      }
      if (!customRadius || customRadius <= 0) {
        alert("Please enter a valid radius (greater than 0 km).");
        return;
      }

      // Geocode the address for address_radius type
      let centerCoords: { lat: number; lng: number } | undefined = undefined;
      const cachedCoords = geocodeCache.current[customAddress.toLowerCase().trim()]; // Use a consistent key for address cache

      if (cachedCoords) {
        centerCoords = { lat: cachedCoords.latitude, lng: cachedCoords.longitude };
      } else {
        try {
          setLoading(true); // Use main loading indicator for this potentially slow operation
          const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(customAddress)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;
          const response = await fetch(geocodeUrl);
          const geoData = await response.json();
          if (geoData.features && geoData.features.length > 0) {
            const [longitude, latitude] = geoData.features[0].center;
            centerCoords = { lat: latitude, lng: longitude };
            geocodeCache.current[customAddress.toLowerCase().trim()] = { latitude, longitude }; // Cache it
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
      
      searchDefinition = {
        type: 'address_radius',
        address: customAddress,
        radiusKm: customRadius,
        center: centerCoords
      };
    }

    try {
      setLoading(true); // Indicate saving process
      // const { data: { user } } = await supabase.auth.getUser(); // Uncomment if using auth for user_id
      
      const { error: insertError } = await supabase
        .from('user_saved_searches')
        .insert({
          // user_id: user?.id, // Uncomment if using auth
          name: customSearchName,
          search_type: customSearchType,
          definition: searchDefinition, 
        });

      if (insertError) throw insertError;

      alert('Custom search saved successfully!');
      fetchSavedSearches(); // Refresh the list
      // Clear form
      setCustomSearchName('');
      setCustomSearchType('map_area');
      setDrawnShapeData(null);
      setCustomAddress('');
      setCustomRadius(5);
      if (currentDrawnLayerRef.current && featureGroupRef.current) {
        featureGroupRef.current.removeLayer(currentDrawnLayerRef.current);
        currentDrawnLayerRef.current = null;
      }

    } catch (e: any) {
      console.error("Error saving custom search:", e);
      alert("Failed to save custom search: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Delete Saved Search Handler ---
  const handleDeleteSavedSearch = async (searchId: string, searchName: string) => {
    if (!window.confirm(`Are you sure you want to delete the saved search "${searchName}"?`)) {
      return;
    }
    try {
      // setLoading(true); // Optional: add specific loading state for delete if needed
      const { error: deleteError } = await supabase
        .from('user_saved_searches')
        .delete()
        .eq('id', searchId);

      if (deleteError) throw deleteError;

      // alert('Search deleted successfully!'); // Or use a toast notification
      fetchSavedSearches(); // Refresh the list

      // If the deleted search was selected in the filter, reset the filter
      if (selectedSavedSearchId === searchId) {
         setSelectedSavedSearchId(null);
      }

    } catch (e: any) {
      console.error("Error deleting saved search:", e);
      alert("Failed to delete saved search: " + e.message);
    } finally {
      // setLoading(false);
    }
  };

  // Display loading/error for client numbers if relevant
  if (loadingClientNumbers && activeTab !== 'Custom Save') { // Only show blocking loader outside custom save tab maybe?
      return <div className="container mx-auto p-4 text-center">Loading client data...</div>; // Or a spinner
  }
  if (errorClientNumbers) {
      return <div className="container mx-auto p-4 text-center text-red-500">Error loading client data: {errorClientNumbers}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">New Leads</h1>
      <p className="text-sm text-gray-600 mb-4"> 
        Add companies to your <a href="/dashboard/clients" className="text-indigo-600 hover:underline">Clients list</a> to hide them from this shared New Leads view. This helps prevent other accountants from contacting your clients.
      </p>

      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {['List', 'Map View', 'Custom Save'].map((tabName) => (
          <button
              key={tabName}
              onClick={() => handleTabChange(tabName as Tab)}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tabName
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
              {tabName}
          </button>
          ))}
        </nav>
      </div>
      
      {/* Date Filters - Placed above tab content so it applies to both */}
      <div className="mb-6 p-4 border rounded-md bg-gray-50 flex flex-wrap gap-4 items-center">
        <div>
          <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date:</label>
          <input 
            type="date" 
            id="start-date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCurrentPage(1); // Reset page on filter change
            }}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date:</label>
          <input 
            type="date" 
            id="end-date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setCurrentPage(1); // Reset page on filter change
            }}
            min={startDate}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        
        {/* New City Filter Input */}
        <div>
           <label htmlFor="city-filter" className="block text-sm font-medium text-gray-700 mb-1">City:</label>
           <input 
              type="text" 
              id="city-filter"
              value={cityFilter}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setCurrentPage(1); // Reset page on filter change
              }}
              placeholder="e.g., London"
              className="mt-1 p-2 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
           />
        </div>
        
        {/* New Custom Search Filter Dropdown (Only visible if saved searches exist and list tab is active?) - Let's show always for simplicity first */}
        {activeTab === 'List' && (
          <div>
            <label htmlFor="custom-filter" className="block text-sm font-medium text-gray-700 mb-1">Custom Filter:</label>
            <select 
              id="custom-filter"
              value={selectedSavedSearchId ?? ''} // Use empty string for "None"
              onChange={(e) => {
                  setSelectedSavedSearchId(e.target.value || null); // Set to null if empty string
                  setCurrentPage(1); // Reset page on filter change
              }}
              disabled={loadingSavedSearches} // Disable while loading searches
              className="mt-1 p-2 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white disabled:bg-gray-100"
            >
              <option value="">None - Use Date Range Only</option>
              {savedSearches.map(search => (
                <option key={search.id} value={search.id}>
                  {search.name} ({search.search_type === 'map_area' ? 'Map Area' : 'Address + Radius'})
                </option>
              ))}
            </select>
            {loadingSavedSearches && <span className="text-xs text-gray-500 ml-2">Loading filters...</span>}
          </div>
        )}
      </div>

      <div>
        {activeTab === 'List' && (
          <div>
            {/* <h2 className="text-xl font-semibold mb-4">List View</h2> */} {/* Title already present or implicit */}
            {loading && <p>Loading new leads...</p>}
            {error && <p className="text-red-500">{error}</p>}
            {!loading && !error && leadCompanies.length === 0 && (
              <p>No companies found matching the criteria{selectedSavedSearchId ? ' for the selected custom filter' : ''} in the date range.</p>
            )}
            {!loading && !error && leadCompanies.length > 0 && (
              <>
                <ul className="space-y-4 mb-6">
                  {leadCompanies.map((company) => {
                    // Construct address string for display
                    const displayAddress = [
                        company.reg_address_address_line1,
                        company.reg_address_post_town,
                        company.reg_address_post_code
                    ].filter(Boolean).join(', ');

                    return (
                      <li key={company.company_number} className="p-4 border rounded-md shadow-sm bg-white">
                        <h3 className="text-lg font-semibold text-primary">{company.company_name || 'N/A'}</h3>
                        {/* <p className="text-sm text-gray-600">Company Number: {company.company_number}</p> */}{/* REMOVED Company Number */}
                        {displayAddress && (
                           <p className="text-sm text-gray-600">{displayAddress}</p> 
                        )}
                        {company.accounts_next_due_date && (
                          <p className="text-sm text-gray-700">
                            Next Accounts Due: {new Date(company.accounts_next_due_date).toLocaleDateString()}
                          </p>
                        )}
                        {company.returns_next_due_date && (
                          <p className="text-sm text-gray-700">
                            Next Confirmation Statement Due: {new Date(company.returns_next_due_date).toLocaleDateString()}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-6">
                    <button 
                      onClick={handlePrevPage} 
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {currentPage} of {totalPages} (Total matching: {totalLeads})
                    </span>
                    <button 
                      onClick={handleNextPage} 
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {activeTab === 'Map View' && (
          <div>
            {/* <h2 className="text-xl font-semibold mb-2">Map View</h2> */} {/* Title already present or implicit */}
            {mapLoading && (
              <div className="flex flex-col items-center justify-center p-8 text-gray-600">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p>
                  {mapLoadingStage === 'fetching' && 'Fetching company data...'}
                  {mapLoadingStage === 'geocoding' && 'Geocoding addresses...'}
                  {mapLoadingStage === 'idle' && 'Initializing map...'} {/* Fallback text */}
                </p>
              </div>
            )}
            {mapError && <p className="text-red-500">{mapError}</p>}
            
            {isDrawingForCustomSearch && (
                <div className="my-2 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
                    <p>Drawing mode active: Draw a shape on the map to define your custom area.</p>
                    <button 
                        onClick={handleConfirmDrawnArea}
                        className="mt-2 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                    >
                        Confirm Drawn Area & Return to Setup
                    </button>
                </div>
            )}

            {(!mapLoading && !mapError && mapCompanies.length === 0 && !isDrawingForCustomSearch) && ( // Check !isDrawing... so it doesn't show if map is just for drawing
              <p>No companies to display on the map for the selected date range, or geocoding failed for all.</p>
            )}
            {/* Render MapContainer if not mapLoading OR if isDrawing (to allow drawing on empty map) */}
            {(!mapLoading || isDrawingForCustomSearch) && !mapError && (
              <MapContainer ref={mapRef} center={mapCenter} zoom={mapZoom} style={{ height: '600px', width: '100%' }} whenReady={() => { console.log("Map is ready."); /* Map instance is in mapRef.current */ }}>
                <TileLayer
                  url={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_ACCESS_TOKEN}`}
                  attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                />
                <FeatureGroup ref={featureGroupRef}> {/* FeatureGroup to hold drawn layers and EditControl */}
                  {isDrawingForCustomSearch && (
                    <EditControl
                      position="topright"
                      onCreated={_onCreated}
                      // onEdited, onDeleted can be added later if needed
                      draw={{
                        rectangle: true,
                        polygon: true,
                        circle: true,
                        circlemarker: false,
                        marker: false,
                        polyline: false,
                      }}
                      edit={{
                        // edit and remove are true by default, can configure if needed
                        // featureGroup: featureGroupRef.current // This is problematic here, layers are added to it directly
                      }}
                    />
                  )}
                </FeatureGroup>
                
                {/* Display existing map markers (companies) only if not in drawing mode, or refine later */}
                {!isDrawingForCustomSearch && mapCompanies.map((company) => {
                  if (company.latitude && company.longitude) {
                    // Construct address string for display
                    const displayAddress = [
                        company.reg_address_address_line1,
                        company.reg_address_post_town,
                        company.reg_address_post_code
                    ].filter(Boolean).join(', ');
                    return (
                      <Marker key={company.company_number} position={[company.latitude, company.longitude]}>
                        <Popup>
                          <b>{company.company_name || 'N/A'}</b><br />
                          {/* Company No: {company.company_number}<br /> */}{/* REMOVED Company Number */}
                          {displayAddress && <>{displayAddress}<br /></>}
                          {company.accounts_next_due_date && <>Next Acc Due: {new Date(company.accounts_next_due_date).toLocaleDateString()}<br /></>}
                          {company.returns_next_due_date && <>Next Conf Stmt Due: {new Date(company.returns_next_due_date).toLocaleDateString()}</>}
                        </Popup>
                      </Marker>
                    );
                  }
                  return null;
                })}
              </MapContainer>
            )}
          </div>
        )}
        {activeTab === 'Custom Save' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-3">Create New Custom Search</h2>
              <div className="p-4 border rounded-md bg-white space-y-4">
                <div>
                  <label htmlFor="custom-search-name" className="block text-sm font-medium text-gray-700">Search Name:</label>
                  <input 
                    type="text" 
                    id="custom-search-name"
                    value={customSearchName}
                    onChange={(e) => setCustomSearchName(e.target.value)}
                    className="mt-1 p-2 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="e.g., My North London Area"
                  />
                </div>
                
                <fieldset>
                  <legend className="text-sm font-medium text-gray-700">Search Type:</legend>
                  <div className="mt-2 space-y-2 sm:space-y-0 sm:flex sm:space-x-4">
                    <div className="flex items-center">
                      <input 
                        id="map_area" 
                        name="customSearchType" 
                        type="radio" 
                        value="map_area"
                        checked={customSearchType === 'map_area'}
                        onChange={() => { setCustomSearchType('map_area'); setDrawnShapeData(null); }}
                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" 
                      />
                      <label htmlFor="map_area" className="ml-2 block text-sm text-gray-900">Define Area on Map</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        id="address_radius" 
                        name="customSearchType" 
                        type="radio" 
                        value="address_radius"
                        checked={customSearchType === 'address_radius'}
                        onChange={() => setCustomSearchType('address_radius')}
                        className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" 
                      />
                      <label htmlFor="address_radius" className="ml-2 block text-sm text-gray-900">Address + Radius</label>
                    </div>
                  </div>
                </fieldset>

                {customSearchType === 'map_area' && (
                  <div className="mt-4 space-y-2">
                    <button 
                      onClick={handleDefineAreaOnMap}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      {drawnShapeData ? 'Redefine Area on Map' : 'Define Area on Map'}
                    </button>
                    {drawnShapeData && (
                      <p className="text-sm text-green-600">Area defined on map. You can rename and save it now.</p>
                    )}
                  </div>
                )}

                {customSearchType === 'address_radius' && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label htmlFor="custom-address" className="block text-sm font-medium text-gray-700">Address:</label>
                      <input 
                        type="text" 
                        id="custom-address"
                        value={customAddress}
                        onChange={(e) => setCustomAddress(e.target.value)}
                        className="mt-1 p-2 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="e.g., 123 Main St, London"
                      />
                    </div>
                    <div>
                      <label htmlFor="custom-radius" className="block text-sm font-medium text-gray-700">Radius (km):</label>
                      <input 
                        type="number" 
                        id="custom-radius"
                        value={customRadius}
                        min="1"
                        onChange={(e) => setCustomRadius(parseFloat(e.target.value))}
                        className="mt-1 p-2 block w-1/3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>
                )}
                <button 
                  onClick={handleSaveCustomSearch}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Save Custom Search
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-3">Your Saved Searches</h2>
              <p className="text-sm text-gray-500 mb-3"> {/* Added instruction text */} 
                Use the filter dropdown in the 'List' tab to view leads based on a saved search.
              </p>
              {loadingSavedSearches && <p>Loading saved searches...</p>}
              {errorSavedSearches && <p className="text-red-500">{errorSavedSearches}</p>}
              {!loadingSavedSearches && !errorSavedSearches && savedSearches.length === 0 && (
                <p className="text-gray-500">You haven't saved any custom searches yet.</p>
              )}
              {!loadingSavedSearches && !errorSavedSearches && savedSearches.length > 0 && (
                <ul className="space-y-3">
                  {savedSearches.map(search => (
                    <li key={search.id} className="p-3 border rounded-md bg-white flex justify-between items-center">
                      <div>
                        <p className="font-medium">{search.name}</p>
                        <p className="text-sm text-gray-600">Type: {search.search_type === 'map_area' ? 'Map Area' : 'Address + Radius'}</p>
                      </div>
                      <div>
                        {/* REMOVED View Leads button */}
                        <button 
                          onClick={() => handleDeleteSavedSearch(search.id, search.name)} // Added onClick
                          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed" // Removed 'disabled' attribute
                        >
                          Delete
                        </button>
                      </div>
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