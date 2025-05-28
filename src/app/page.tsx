'use client'

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

// Helper component for Feature Cards for better reusability
const FeatureCard = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
  <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 ease-in-out">
    <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 text-primary mb-5 mx-auto md:mx-0">
      <span className="material-icons text-3xl">{icon}</span>
    </div>
    <h3 className="text-xl md:text-2xl font-semibold text-gray-800 mb-3 text-center md:text-left">{title}</h3>
    <p className="text-gray-600 text-center md:text-left">{children}</p>
  </div>
);

export default function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      setLoadingAuth(true);
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      if (error) {
        console.error("Error fetching session:", error.message);
        setUser(null);
      }
      setLoadingAuth(false);
    };

    fetchUser();

    // Store the full returned object from onAuthStateChange
    const authStateChangeHandler = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    });

    return () => {
      // authStateChangeHandler is { data: { subscription: Subscription }, error: AuthError | null }
      // Access the subscription object safely and call unsubscribe
      if (authStateChangeHandler && 
          authStateChangeHandler.data && 
          authStateChangeHandler.data.subscription && 
          typeof authStateChangeHandler.data.subscription.unsubscribe === 'function') {
        authStateChangeHandler.data.subscription.unsubscribe();
      } else {
        // This log can help if the unsubscribe call is not made as expected or if parts of the path are missing.
        console.warn('Auth state change subscription or its unsubscribe method not found during cleanup.');
      }
    };
  }, []);

  const handleSignOut = async () => {
    setLoadingAuth(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error.message);
      // Optionally show an error message to the user
    }
    // setUser(null); // Auth listener will handle this
    // setLoadingAuth(false); // Auth listener will handle this
    // Redirect or update UI as needed, typically auth listener handles user state
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-sky-100 text-gray-700">
      {/* Navigation Bar */}
      <nav className="bg-white/80 backdrop-blur-md shadow-sm fixed w-full z-20 border-b border-gray-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <Image src="/logo.png" alt="AccFlow Logo" width={140} height={35} priority />
            </Link>
            <div className="space-x-3 sm:space-x-4 flex items-center">
              {/* <Link href="/find-accountant" className="text-primary hover:text-primary/80 font-medium px-3 py-2 rounded-md text-sm sm:text-base transition-colors">
                Find Accountant
              </Link> */}
              {loadingAuth ? (
                <div className="h-8 w-24 bg-gray-200 animate-pulse rounded-md"></div> // Basic loader
              ) : user ? (
                <>
                  <Link href="/dashboard" className="text-primary hover:text-primary/80 font-medium px-3 py-2 rounded-md text-sm sm:text-base transition-colors">
                    Dashboard
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 font-semibold text-sm sm:text-base shadow-md hover:shadow-lg transition-all"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-primary hover:text-primary/80 font-medium px-3 py-2 rounded-md text-sm sm:text-base transition-colors">
                    Login
                  </Link>
                  <Link href="/signup" className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 font-semibold text-sm sm:text-base shadow-md hover:shadow-lg transition-all">
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer for fixed navbar */}
      <div className="pt-16" />

      {/* Hero Section */}
      <section className="py-20 md:py-32 text-center bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Effortlessly <span className="text-primary">Manage Clients</span> &<br className="hidden sm:block" /> Unlock <span className="text-primary">New Leads</span>.
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
            AccFlow is your all-in-one platform for accountants. Streamline client workflows, automate critical deadlines, and discover a consistent stream of new business opportunities.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-6">
            <Link 
              href="/signup" 
              className="bg-primary text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary/90 transition duration-300 shadow-xl hover:shadow-primary/40 transform hover:scale-105 w-full sm:w-auto"
            >
              Sign Up
            </Link>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-transparent text-primary border-2 border-primary px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary/10 transition duration-300 transform hover:scale-105 w-full sm:w-auto"
            >
              Book a Demo
            </button>
          </div>
        </div>
      </section>

      {/* Enhanced Lead Generation & Client Acquisition Section */}
      <section className="py-16 md:py-24 bg-sky-50/70">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16">
            <span className="text-primary font-semibold uppercase tracking-wider text-sm">Grow Your Practice</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mt-2">
              Unlock a Stream of Qualified Local Leads
            </h2>
            <p className="text-gray-600 mt-4 text-lg max-w-3xl mx-auto">
              Stop waiting for referrals. AccFlow proactively identifies businesses in your area that need accounting services right now, based on Companies House data. Filter by upcoming deadlines, location, and more to find your perfect next client.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div className="order-2 md:order-1">
              <h3 className="text-2xl font-semibold text-gray-800 mb-4">Targeted Lead Discovery</h3>
              <ul className="space-y-3 text-gray-600 text-lg mb-6">
                <li className="flex items-start">
                  <span className="material-icons text-primary mr-2 pt-1">check_circle_outline</span>
                  <span>Pinpoint businesses with approaching accounts or confirmation statement deadlines.</span>
                </li>
                <li className="flex items-start">
                  <span className="material-icons text-primary mr-2 pt-1">check_circle_outline</span>
                  <span>Focus on specific towns or postcodes to build your local presence.</span>
                </li>
                <li className="flex items-start">
                  <span className="material-icons text-primary mr-2 pt-1">check_circle_outline</span>
                  <span>Quickly identify companies without a listed accountant. (Coming Soon)</span>
                </li>
                <li className="flex items-start">
                  <span className="material-icons text-primary mr-2 pt-1">check_circle_outline</span>
                  <span>Save custom search criteria for ongoing lead monitoring.</span>
                </li>
              </ul>
              <p className="text-gray-600 mb-6 text-lg">
                Our intelligent system automatically excludes your existing AccFlow clients, so you can focus on new opportunities with confidence.
              </p>
              <Link href="/signup" className="bg-primary text-white px-6 py-3 rounded-lg font-semibold text-lg hover:bg-primary/90 transition duration-300 inline-flex items-center group">
                Start Finding Leads <span className="material-icons ml-2 transition-transform duration-200 group-hover:translate-x-1">arrow_forward</span>
              </Link>
            </div>
            <div className="order-1 md:order-2 flex justify-center">
              {/* Mock UI for Lead Generation */}
              <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-xl text-gray-700">New Lead Opportunities</h4>
                  <div className="flex space-x-2">
                    <span className="material-icons text-gray-400 hover:text-primary cursor-pointer">filter_list</span>
                    <span className="material-icons text-gray-400 hover:text-primary cursor-pointer">map</span>
                  </div>
                </div>
                <div className="mb-4">
                  <input type="text" placeholder="Search by company name or area..." className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary" />
                </div>
                <div className="space-y-3 h-64 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-primary/10">
                  <div className="p-3 bg-green-50 rounded-md border border-green-200">
                    <div className="font-semibold text-green-700">Dynamic Digital Ltd</div>
                    <p className="text-sm text-gray-600">Accounts due: <span className="font-medium">25 Oct 2024</span> (in 30 days)</p>
                    <p className="text-sm text-gray-500">Manchester, M1</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-md border border-amber-200">
                    <div className="font-semibold text-amber-700">Creative Solutions Co.</div>
                    <p className="text-sm text-gray-600">Confirmation Statement overdue: <span className="font-medium text-red-600">15 Sep 2024</span></p>
                    <p className="text-sm text-gray-500">London, WC2</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-md border border-green-200">
                    <div className="font-semibold text-green-700">Innovatech Systems</div>
                    <p className="text-sm text-gray-600">Accounts due: <span className="font-medium">12 Nov 2024</span> (in 48 days)</p>
                    <p className="text-sm text-gray-500">Birmingham, B2</p>
                  </div>
                   <div className="p-3 bg-green-50 rounded-md border border-green-200">
                    <div className="font-semibold text-green-700">Future Build UK</div>
                    <p className="text-sm text-gray-600">Accounts due: <span className="font-medium">30 Nov 2024</span> (in 66 days)</p>
                    <p className="text-sm text-gray-500">Leeds, LS1</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Client Management Excellence Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16">
            <span className="text-primary font-semibold uppercase tracking-wider text-sm">Effortless Practice Management</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mt-2">
              Master Your Client Workflows
            </h2>
            <p className="text-gray-600 mt-4 text-lg max-w-3xl mx-auto">
              AccFlow provides a robust suite of tools designed to streamline every aspect of client interaction and task management, freeing you up to focus on high-value services.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard icon="groups" title="Unified Client Hub">
              Manage all client information, communication logs, documents, and key dates in one secure, easily accessible place. Say goodbye to scattered spreadsheets.
            </FeatureCard>
            <FeatureCard icon="task_alt" title="Automated Deadline Guardian">
              Never miss a Companies House or HMRC deadline. AccFlow automatically tracks key dates and can send timely reminders to you and your clients.
            </FeatureCard>
            <FeatureCard icon="cloud_upload" title="Secure Client Document Portal">
              Effortlessly request and receive documents through a branded, secure portal. Your clients will love the simplicity, you&apos;ll love the organization.
            </FeatureCard>
            <FeatureCard icon="hub" title="Smart Task & Workflow Automation">
              Visualize your team&apos;s workload, assign tasks, track progress through customizable workflow stages, and automate routine communications.
            </FeatureCard>
            <FeatureCard icon="receipt_long" title="Engagement & Service Tracking">
              Clearly define and track services for each client. Easily manage engagement letters and monitor the scope of your work. (Coming Soon)
            </FeatureCard>
            <FeatureCard icon="contact_mail" title="Integrated Client Communication">
              Log emails, notes, and schedule follow-ups directly within the client record. Maintain a complete history of all interactions.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* All-Encompassing Features Section (Previously Core Benefits) */}
      <section className="py-16 md:py-24 bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">More Than Just Management & Leads</h2>
            <p className="text-gray-600 mt-3 text-lg max-w-2xl mx-auto">AccFlow is packed with additional features to help your practice thrive, from AI assistance to insightful analytics.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard icon="mail_outline" title="Automated Client Communication">
              Set up automated email sequences for reminders, information requests, or onboarding. Save hours while maintaining a personal touch.
            </FeatureCard>
            <FeatureCard icon="rule" title="AI-Powered Document Check">
              Spend less time chasing paperwork. Our AI analyzes client documents upon upload, intelligently identifying missing information or potential issues, ensuring you have everything you need, faster.
            </FeatureCard>
            <FeatureCard icon="insights" title="Data-Driven Practice Insights">
              Gain a clearer view of your practice&apos;s performance, client engagement, revenue trends, and upcoming workload to make informed business decisions.
            </FeatureCard>
            <FeatureCard icon="support_agent" title="Dedicated Support & Onboarding">
               Our expert team is here to help you get the most out of AccFlow, from initial setup to ongoing support and training.
            </FeatureCard>
             <FeatureCard icon="lock_person" title="Bank-Grade Security">
               Protect sensitive client data with robust security measures, regular backups, and compliance with industry best practices.
            </FeatureCard>
             <FeatureCard icon="integration_instructions" title="Seamless Integrations (Coming Soon)">
               Connect AccFlow with your favorite accounting software and other tools to create a truly unified practice ecosystem.
            </FeatureCard>
          </div>
        </div>
      </section>
      
      {/* Call to Action Section */}
      <section className="py-20 md:py-32 bg-primary text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Revolutionize Your Practice?</h2>
          <p className="text-lg md:text-xl text-primary/30 mb-10 max-w-2xl mx-auto">
            Join hundreds of forward-thinking accountants who are saving time, reducing stress, and growing their firms with AccFlow.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white text-primary px-12 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition duration-300 shadow-2xl transform hover:scale-105"
          >
            Book a Demo
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-800 text-slate-400 border-t border-slate-700">
        <div className="container mx-auto px-6 py-10 text-center">
          <Image src="/logo.png" alt="AccFlow Logo Light" width={120} height={30} className="mx-auto mb-4 filter brightness-0 invert" />
          <p>&copy; {new Date().getFullYear()} AccFlow. All rights reserved.</p>
          <p className="mt-2 text-sm">
            Empowering Accountancy Professionals with Intelligent Automation.
          </p>
          <div className="mt-6 space-x-4">
            {/* Add links to privacy policy, terms of service if they exist */}
            {/* <Link href="/privacy" className="hover:text-slate-200">Privacy Policy</Link> */}
            {/* <Link href="/terms" className="hover:text-slate-200">Terms of Service</Link> */}
          </div>
        </div>
      </footer>

      {/* Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-opacity duration-300 ease-in-out animate-fadeIn">
          <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-2xl relative transform transition-all duration-300 ease-in-out animate-scaleUp">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-800">Book Your AccFlow Demo</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close modal"
              >
                <span className="material-icons text-3xl">close</span>
              </button>
            </div>
            <div>
              {/* Google Calendar Appointment Scheduling begin */}
              <iframe
                src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ2Wq3LgFGQ-b-lJHHPsNQvErfQG_Y9mudPogwUiq_Ccx0B66870837BKrTgkJwy884RH59ww5MK?gv=true"
                style={{ border: 0 }}
                width="100%"
                height="600"
                frameBorder="0"
                title="Google Calendar Appointment Scheduling"
              ></iframe>
              {/* end Google Calendar Appointment Scheduling */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Minimal CSS for animations (could be in globals.css)
// This shows example, but for actual implementation, add to globals.css
// @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
// @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
// .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
// .animate-scaleUp { animation: scaleUp 0.3s ease-out forwards; }

// Ensure Tailwind JIT picks up these classes if defined here for some reason
// class="animate-fadeIn"
// class="animate-scaleUp"
