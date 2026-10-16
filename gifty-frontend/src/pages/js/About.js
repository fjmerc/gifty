import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faBell, faCalendarDays, faGift, faMinus, faPlus, faUsers, faWallet, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import styles from '../css/About.module.css';
import { useInstanceInfo } from '../../utils/instanceInfo';

const About = () => {
  const [activeAccordion, setActiveAccordion] = useState(null);
  const instanceInfo = useInstanceInfo();

  const toggleAccordion = (index) => {
    setActiveAccordion(activeAccordion === index ? null : index);
  };

  const faqItems = [
    {
      question: "How does Gifty help me choose gifts?",
      answer: "Gifty uses a combination of your recipient's preferences, event type, and AI-powered suggestions to recommend personalized gifts. The system learns from your feedback to improve suggestions over time, making it easier to find the perfect gift for any occasion."
    },
    {
      question: "Can I set budgets for different people or events?",
      answer: "Yes! Gifty allows you to set individual budgets for different recipients and track your spending across multiple events. The budget analytics feature helps you visualize your spending patterns and ensure you stay within your planned budget."
    },
    {
      question: "How do I get notified about upcoming events?",
      answer: "Gifty's notification system sends timely reminders for upcoming birthdays, anniversaries, and other occasions. You can customize when you receive reminders and choose to get them via email or in-app notifications."
    },
    {
      question: "Is my data secure on Gifty?",
      answer: "Absolutely. Gifty employs JWT-based authentication and secure data storage practices. Your personal information and gift data are encrypted and accessible only to you through your secure account."
    },
    {
      question: "Can I use Gifty on my mobile phone?",
      answer: "Yes, Gifty is designed with responsive layouts that work well on both desktop and mobile devices. You can access all features through your mobile browser, making it convenient to manage gifts on the go."
    }
  ];

  return (
    <div className={styles.aboutPage}>
      <section className={styles.heroSection}>
        <h1>About Gifty</h1>
        <p>
          Gifty is a comprehensive gift management application designed to take the stress out of gift-giving.
          From personalized AI suggestions to budget tracking and event reminders, Gifty helps you become
          the perfect gift-giver for every occasion.
        </p>
        <Link to="/register" className={styles.btnPrimary}>Get Started Now</Link>
      </section>

      <section className={styles.featuresSection}>
        <h2 className={styles.sectionTitle}>Key Features</h2>
        <div className={styles.featuresGrid}>
          <div className={styles.feature}>
            <div className={styles.featureIcon} aria-hidden="true"><FontAwesomeIcon icon={faGift} /></div>
            <h3>Gift Management</h3>
            <p>
              Easily organize and track gifts for all your recipients. Save ideas, mark purchases,
              and never forget a gift again. Gifty keeps your gift history organized and accessible.
            </p>
          </div>

          <div className={styles.feature}>
            <div className={styles.featureIcon} aria-hidden="true"><FontAwesomeIcon icon={faWandMagicSparkles} /></div>
            <h3>AI Gift Suggestions</h3>
            <p>
              Powered by advanced AI, Gifty generates personalized gift ideas based on recipient preferences,
              past gifts, occasion type, and your budget. The system improves with your feedback!
            </p>
          </div>

          <div className={styles.feature}>
            <div className={styles.featureIcon} aria-hidden="true"><FontAwesomeIcon icon={faCalendarDays} /></div>
            <h3>Event Tracking</h3>
            <p>
              Keep track of birthdays, anniversaries, holidays, and other gift-giving occasions.
              Gifty's calendar view gives you a clear overview of upcoming events.
            </p>
          </div>

          <div className={styles.feature}>
            <div className={styles.featureIcon} aria-hidden="true"><FontAwesomeIcon icon={faWallet} /></div>
            <h3>Budget Planning</h3>
            <p>
              Set spending limits for each recipient or event. Gifty's budget analytics help you
              visualize spending patterns and ensure you stay within your gift-giving budget.
            </p>
          </div>

          <div className={styles.feature}>
            <div className={styles.featureIcon} aria-hidden="true"><FontAwesomeIcon icon={faUsers} /></div>
            <h3>Recipient Management</h3>
            <p>
              Create detailed profiles for your gift recipients, including preferences, interests,
              sizes, and other important details to help find the perfect gift every time.
            </p>
          </div>

          <div className={styles.feature}>
            <div className={styles.featureIcon} aria-hidden="true"><FontAwesomeIcon icon={faBell} /></div>
            <h3>Smart Notifications</h3>
            <p>
              Never miss an important date with customizable reminders. Receive notifications via email
              or in-app alerts for upcoming events, giving you plenty of time to prepare.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <h2>Ready to Become the Perfect Gift-Giver?</h2>
        <p>
          Join Gifty today and transform your gift-giving experience. Our intuitive platform helps you
          find the perfect gift for every occasion, staying organized and within budget.
        </p>
        <Link to="/register" className={styles.btnPrimary}>Create Free Account</Link>
      </section>

      <section className={styles.faqSection}>
        <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
        {faqItems.map((item, index) => (
          <div key={index} className={styles.faqItem}>
            <h3>
              <button
                type="button"
                className={styles.faqQuestion}
                onClick={() => toggleAccordion(index)}
                aria-expanded={activeAccordion === index}
                aria-controls={activeAccordion === index ? `faq-answer-${index}` : undefined}
              >
                {item.question}
                <FontAwesomeIcon icon={activeAccordion === index ? faMinus : faPlus} className={styles.faqIndicator} aria-hidden="true" />
              </button>
            </h3>
            {activeAccordion === index && <p id={`faq-answer-${index}`}>{item.answer}</p>}
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Gifty - The Ultimate Gift Management Application</p>
        {instanceInfo && <p className={styles.version}>Gifty v{instanceInfo.version}</p>}
        <p className={styles.backHome}>
          <Link to="/" className={styles.backHomeLink}>
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
            Back to Home
          </Link>
        </p>
      </footer>
    </div>
  );
};

export default About;
