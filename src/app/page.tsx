'use client'

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

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
              <Link href="/login" className="text-primary hover:text-primary/80 font-medium px-3 py-2 rounded-md text-sm sm:text-base transition-colors">
                Login
              </Link>
              <Link href="/signup" className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 font-semibold text-sm sm:text-base shadow-md hover:shadow-lg transition-all">
                Get Started Free
              </Link>
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
            Accountancy, <span className="text-primary">Amplified.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
            Stop chasing paperwork. Start growing your practice. AccFlow intelligently automates your workflows, finds new leads, and keeps your clients happy.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-primary text-white px-10 py-4 rounded-lg font-semibold text-lg hover:bg-primary/90 transition duration-300 shadow-xl hover:shadow-primary/40 transform hover:scale-105"
          >
            Book a Demo
          </button>
        </div>
      </section>

      {/* Lead Generation Feature - "Problem/Solution" */}
      <section className="py-16 md:py-24 bg-sky-50/70">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <span className="text-primary font-semibold uppercase tracking-wider text-sm">Effortless Lead Generation</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mt-2 mb-6">
                Discover Clients Who Need You, Before They Know It.
              </h2>
              <p className="text-gray-600 mb-4 text-lg">
                Tired of cold calls and unpredictable referrals? AccFlow taps into Companies House data to identify businesses with upcoming account deadlines who don&apos;t have an accountant on record.
              </p>
              <p className="text-gray-600 mb-6 text-lg">
                We&apos;ll show you potential clients in your area, so you can offer your expertise exactly when they need it most. (And yes, your existing AccFlow clients are automatically excluded from this list!)
              </p>
              <Link href="/signup" className="text-primary font-semibold hover:underline text-lg group">
                Find Your Next Client <span className="material-icons inline-block align-middle transition-transform duration-200 group-hover:translate-x-1">arrow_forward</span>
              </Link>
            </div>
            <div className="order-1 md:order-2 flex justify-center">
              {/* Placeholder for a more dynamic visual - e.g., a mock UI snippet or abstract graphic */}
              <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center text-green-500 mb-3">
                  <span className="material-icons text-3xl mr-2">radar</span>
                  <h4 className="font-semibold text-xl">New Leads Detected</h4>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 rounded-md">&quot;Alpha Solutions Ltd&quot; - Accounts due in 60 days</div>
                  <div className="p-3 bg-green-50 rounded-md">&quot;Beta Innovations&quot; - Confirmation Statement overdue</div>
                  <div className="p-3 bg-green-50 rounded-md">&quot;Gamma Services&quot; - Accounts due in 45 days</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Benefits Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800">Everything Your Practice Needs to Thrive</h2>
            <p className="text-gray-600 mt-3 text-lg max-w-2xl mx-auto">From seamless client onboarding to automated deadline management, AccFlow is your central command.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard icon="groups" title="Unified Client Hub">
              Manage all client information, communication logs, and key dates in one secure, easily accessible place. Say goodbye to scattered spreadsheets.
            </FeatureCard>
            <FeatureCard icon="task_alt" title="Automated Deadline Guardian">
              Never miss a Companies House or HMRC deadline. AccFlow automatically tracks key dates and can send timely reminders to you and your clients.
            </FeatureCard>
            <FeatureCard icon="cloud_upload" title="Secure Client Document Portal">
              Effortlessly request and receive documents through a branded, secure portal. Your clients will love the simplicity, you&apos;ll love the organization.
            </FeatureCard>
            <FeatureCard icon="hub" title="Smart Task & Workflow">
              Visualize your team&apos;s workload, assign tasks, and track progress through customizable workflow stages. Ensure nothing falls through the cracks.
            </FeatureCard>
            <FeatureCard icon="mail_outline" title="Automated Client Communication">
              Set up automated email sequences for reminders, information requests, or onboarding. Save hours while maintaining a personal touch.
            </FeatureCard>
            <FeatureCard icon="rule" title="AI-Powered Document Check">
              Spend less time chasing paperwork. Our AI analyzes client documents upon upload, intelligently identifying missing information or potential issues, ensuring you have everything you need, faster.
            </FeatureCard>
             <FeatureCard icon="insights" title="Data-Driven Insights">
              Gain a clearer view of your practice&apos;s performance, client engagement, and upcoming workload to make informed business decisions.
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
