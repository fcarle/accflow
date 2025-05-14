import type { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import Head from 'next/head';

// Define the structure of an Alert, matching our API response
// We should ideally share this type with the backend API routes
interface ClientAlert {
  id: string;
  created_at: string;
  client_id: string;
  alert_type: string;
  alert_message: string;
  days_before_due: number;
  is_active: boolean;
  notification_preference: 'DRAFT_FOR_TEAM' | 'SEND_DIRECT_TO_CLIENT';
  source_task_id?: string | null;
  last_triggered_at?: string | null;
  clients?: { // clients is an object, not an array, based on our API
    client_name: string;
  };
}

interface ClientSpecificAlertsPageProps {
  alerts: ClientAlert[];
  clientId: string;
  clientName?: string; // Optional: Fetch client name too
  error?: string;
}

const ClientSpecificAlertsPage: NextPage<ClientSpecificAlertsPageProps> = ({ alerts, clientId, clientName, error }) => {
  if (error) {
    return (
      <div>
        <Head>
          <title>Error Loading Alerts</title>
        </Head>
        <h1>Error Loading Alerts for Client {clientName || clientId}</h1>
        <p>{error}</p>
        <Link href="/clients">Back to Clients List</Link> { /* Assuming you have a clients list page */}
      </div>
    );
  }

  const handleDelete = (alertId: string) => {
    console.log(`Placeholder: Delete action for alert ID: ${alertId} for client ${clientId}`);
    window.alert('Delete functionality not yet implemented. See console for ID.');
  };

  return (
    <div>
      <Head>
        <title>Alerts for {clientName || `Client ${clientId.substring(0,8)}...`}</title>
      </Head>
      <h1>Alerts for {clientName || `Client ${clientId.substring(0,8)}...`}</h1>
      <Link href={`/clients/${clientId}/alerts/new`}>
        <button style={{ marginBottom: '20px', padding: '10px' }}>Create New Alert for this Client</button>
      </Link>
      <Link href="/clients" style={{ marginLeft: '10px' }}>Back to Client List</Link> {/* Adjust if needed */}
      
      {alerts.length === 0 ? (
        <p>No client alerts configured for this client yet.</p>
      ) : (
        <table border={1} style={{ borderCollapse: 'collapse', width: '100%', marginTop: '20px' }}>
          <thead>
            <tr>
              <th>ID</th>
              {/* Client Name column is removed as we are in client context */}
              <th>Alert Type</th>
              <th>Days Before Due</th>
              <th>Notification Pref.</th>
              <th>Is Active</th>
              <th>Message Preview</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <td>{alert.id.substring(0, 8)}...</td>
                <td>{alert.alert_type}</td>
                <td>{alert.days_before_due}</td>
                <td>{alert.notification_preference}</td>
                <td>{alert.is_active ? 'Yes' : 'No'}</td>
                <td>{alert.alert_message.substring(0, 50)}...</td>
                <td>
                  <Link href={`/clients/${clientId}/alerts/${alert.id}/edit`} style={{ marginRight: '8px' }}>Edit</Link>
                  <button onClick={() => handleDelete(alert.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { clientId } = context.params || {}; // Get clientId from dynamic route segment

  if (!clientId || typeof clientId !== 'string') {
    return { notFound: true }; // Or handle as an error
  }

  const dev = process.env.NODE_ENV !== 'production';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const server = dev ? 'http://localhost:3000' : siteUrl;

  let clientName: string | undefined = undefined;

  try {
    // Optional: Fetch client name for display
    // This assumes you have a Supabase client instance available or can create one
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: clientData } = await supabase
      .from('clients')
      .select('client_name')
      .eq('id', clientId)
      .single();
    if (clientData) {
      clientName = clientData.client_name;
    }

    // Fetch alerts for this specific client
    const res = await fetch(`${server}/api/client-alerts?client_id=${clientId}`);
    if (!res.ok) {
      let errorMsg = `Failed to fetch alerts for client ${clientId}, status: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMsg = errorData.error || errorMsg;
      } catch {
        errorMsg = res.statusText || errorMsg;
      }
      throw new Error(errorMsg);
    }
    const alerts: ClientAlert[] = await res.json();
    
    return {
      props: { 
        alerts,
        clientId,
        clientName: clientName || null, // Pass clientName or null
      },
    };
  } catch (error: unknown) {
    console.error(`[getServerSideProps /clients/${clientId}/alerts] Error:`, error);
    let errorMessage = 'Could not fetch client alerts.';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    return {
      props: { 
        alerts: [],
        clientId,
        clientName: clientName || null,
        error: errorMessage
      },
    };
  }
};

export default ClientSpecificAlertsPage; 