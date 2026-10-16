import React, { useState, useEffect, useId } from 'react';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../AuthContext';
import { toast } from 'react-toastify';
import '../css/EmailConfig.css';
import useConfirm from '../ui/useConfirm';
import { ModalActions } from '../ui/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';

const EmailConfig = ({ onSuccess, refreshTrigger }) => {
  const { confirm, confirmDialog } = useConfirm();
  const formId = useId();
  // The session is an httpOnly cookie: there is no token to read, only whether signed in
  const { isAuthenticated } = useAuth() || {};
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [config, setConfig] = useState({
    service: 'gmail',
    host: '',
    port: 587,
    // Implicit TLS: only port 465 speaks it (587/2525/25 use STARTTLS)
    secure: false,
    // STARTTLS required: on for 587, off for local relays on 25/2525
    requireTLS: true,
    username: '',
    password: '',
    fromName: 'Gifty Notifications',
    enabled: true
  });
  const [hasExistingConfig, setHasExistingConfig] = useState(false);
  // Once the user sets "secure" by hand, port changes stop setting it
  const [secureTouched, setSecureTouched] = useState(false);
  const [requireTLSTouched, setRequireTLSTouched] = useState(false);
  // Where mail went when loaded or last saved: changing it needs the password
  const [savedDestination, setSavedDestination] = useState(null);
  // The server's reason the password field was refused (e.g. needed again)
  const [passwordFieldError, setPasswordFieldError] = useState('');
  
  // Development mode and mock API functionality can be implemented here if needed
  // const isDevelopment = process.env.NODE_ENV === 'development';
  // const useMockApi = isDevelopment && false; // Set to true to use mock data
  
  // Fetch existing email configuration
  useEffect(() => {
    const fetchEmailConfig = async () => {
      try {
        setSaveSuccess(false);
        setError('');
        setLoading(true);
        const response = await axiosInstance.get('/email-config');
        
        if (response.data) {
          // Update form with existing config (omitting password)
          setConfig({
            ...response.data,
            // Settings saved before the STARTTLS option count by their port
            requireTLS: typeof response.data.requireTLS === 'boolean' ? response.data.requireTLS : Number(response.data.port) === 587,
            password: '' // Don't display existing password
          });
          setHasExistingConfig(true);
          setSavedDestination(response.data);
        }
      } catch (error) {
        console.error('Error in fetchEmailConfig:', error);
        // If 404, it means no config exists yet
        if (error.response) {
          if (error.response.status !== 404) {
            toast.error('Failed to load email configuration');
          }
        } else {
          console.error('Network error or no response:', error);
          toast.error('Network error while loading configuration');
        }
      } finally {
        setLoading(false);
      }
    };
    
    if (isAuthenticated) {
      fetchEmailConfig();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, refreshTrigger]);
  
  // Reset success/error states when form changes
  useEffect(() => {
    setSaveSuccess(false);
  }, [config]);
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'secure') setSecureTouched(true);
    if (name === 'requireTLS') setRequireTLSTouched(true);
    if (name === 'password') setPasswordFieldError('');
    setConfig({
      ...config,
      [name]: type === 'checkbox' ? checked : value,
      // A port change sets the usual TLS mode for it, unless set by hand
      ...(name === 'port' && !secureTouched ? { secure: Number(value) === 465 } : {}),
      ...(name === 'port' && !requireTLSTouched ? { requireTLS: Number(value) === 587 } : {})
    });
  };
  
  // Handle service change (reset host/port for built-in services)
  const handleServiceChange = (e) => {
    const service = e.target.value;
    
    // Update service and reset host/port if choosing a built-in service
    if (service !== 'custom') {
      setConfig({
        ...config,
        service,
        host: '',
        port: 587
      });
    } else {
      setConfig({
        ...config,
        service
      });
    }
  };
  
  // Test email configuration
  const handleTestConfig = async (e) => {
    e.preventDefault();
    try {
      setTestLoading(true);
      setError(''); // Clear any previous error
      
      
      const response = await axiosInstance.post('/email-config/test', {}, {
        timeout: 15000 // 15 second timeout for test emails
      });
      
      
      if (response.data.success) {
        toast.success('Test email sent successfully. Check your inbox!');
      } else {
        toast.error(`Test failed: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Detailed error testing email config:', error);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
        
        let errorMessage = error.response.data?.message || error.response.statusText || 'Unknown error';
        
        // Provide more specific information for 404 errors
        if (error.response.status === 404) {
          errorMessage = 'Test endpoint not found: The email testing service is not available or not properly set up on the server';
        }
        
        setError(errorMessage);
        toast.error(`Server error: ${errorMessage}`);
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received from server');
        const errorMessage = 'No response from server. Please check your connection or server status.';
        setError(errorMessage);
        toast.error(errorMessage);
      } else {
        // Something happened in setting up the request that triggered an Error
        const errorMessage = `Error: ${error.message || 'Unknown error'}`;
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setTestLoading(false);
    }
  };
  
  // Save email configuration
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaveSuccess(false);
      setError('');
      setLoading(true);
      
      setPasswordFieldError('');
      // Prepare data - only include host/port for custom service
      const configData = {
        ...config
      };
      
      // Don't send empty password (to avoid overwriting existing password)
      if (!config.password && hasExistingConfig) {
        delete configData.password;
      }
      
      // Add debug logs
      
      const response = await axiosInstance.post('/email-config', configData, {
        timeout: 10000 // 10 second timeout
      });
      
      
      setHasExistingConfig(true);
      setSavedDestination({ ...configData, ...response.data });
      // Preserve the current config values and update with response data
      setConfig(prevConfig => ({
        ...prevConfig,
        ...response.data,
        // Keep custom fields if they exist in current service
        host: response.data.service === 'custom' ? response.data.host : prevConfig.host,
        port: response.data.service === 'custom' ? response.data.port : prevConfig.port,
        password: '' // Clear password field after successful save
      }));
      
      toast.success('Email configuration saved successfully');
      
      // Set success state
      setSaveSuccess(true);
      setSaveMessage(hasExistingConfig ? 'Configuration updated successfully!' : 'Configuration saved successfully!');
      
      // Notify parent component of successful save, but don't close modal automatically
      if (typeof onSuccess === 'function') {
        // Call onSuccess without closing the modal
        onSuccess(false);
      }
    } catch (error) {
      console.error('Detailed error saving email config:', error);
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
        console.error('Error response headers:', error.response.headers);
        
        const passwordProblem = error.response.data?.errors?.find((e) => e.field === 'password');
        if (passwordProblem) {
          setPasswordFieldError(passwordProblem.message);
          return;
        }

        let errorMessage = error.response.data.message || error.response.statusText || 'Server error';
        
        // Provide more specific information for 404 errors
        if (error.response.status === 404) {
          errorMessage = 'API endpoint not found: The email configuration service is not available or not properly set up on the server';
        }
        
        setError(errorMessage);
        toast.error(`Server error: ${errorMessage}`);
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received from server');
        setError('No response from server. Please check your connection.');
        toast.error('No response from server. Please check your connection.');
      } else {
        // Something happened in setting up the request that triggered an Error
        setError(error.message || 'An error occurred');
        toast.error(`Error: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Delete email configuration
  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete email configuration',
      message: 'Are you sure you want to delete this email configuration?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) {
      return;
    }
    
    try {
      setLoading(true);
      setError(''); // Clear any previous error
      await axiosInstance.delete('/email-config');
      
      // Reset form
      setConfig({
        service: 'gmail',
        host: '',
        port: 587,
        secure: true,
        username: '',
        password: '',
        fromName: 'Gifty Notifications',
        enabled: true
      });
      setHasExistingConfig(false);
      
      toast.success('Email configuration deleted');
      
      // Set success state
      setSaveSuccess(true);
      setSaveMessage('Configuration deleted successfully!');
      
      // Call onSuccess callback if provided
      if (typeof onSuccess === 'function') {
        // Wait a moment for the toast to be visible before closing
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (error) {
      console.error('Error deleting email config:', error);
      if (error.response) {
        // Handle HTTP error responses
        let errorMessage = error.response.data?.message || error.response.statusText || 'Failed to delete email configuration';
        
        // Provide more specific information for 404 errors
        if (error.response.status === 404) {
          errorMessage = 'Email configuration not found or already deleted';
        }
        
        setError(errorMessage);
        toast.error(errorMessage);
      } else if (error.request) {
        // Handle network errors
        const errorMessage = 'No response from server. Please check your connection.';
        setError(errorMessage);
        toast.error(errorMessage);
      } else {
        // Handle other errors
        const errorMessage = error.message || 'Failed to delete email configuration';
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Same rule as the server: service and address always, host/port/TLS for a custom server
  const text = (value) => String(value ?? '').trim().toLowerCase();
  const destinationChanged = Boolean(hasExistingConfig && savedDestination) && (
    text(config.service) !== text(savedDestination.service)
    || text(config.username) !== text(savedDestination.username)
    || (config.service === 'custom' && (
      text(config.host) !== text(savedDestination.host)
      || Number(config.port) !== Number(savedDestination.port)
      || Boolean(config.secure) !== Boolean(savedDestination.secure)
      // Dropping the STARTTLS requirement (rows from before it count by port)
      || (config.requireTLS === false
        && (typeof savedDestination.requireTLS === 'boolean' ? savedDestination.requireTLS : Number(savedDestination.port) === 587))
    ))
  );
  const passwordNeeded = !hasExistingConfig || Boolean(config.passwordNeedsReentry) || destinationChanged;
  // A readable password is saved and nothing asks for it again
  const passwordSaved = hasExistingConfig && !config.passwordNeedsReentry;
  const passwordNotes = [
    passwordFieldError ? 'password-error' : null,
    config.passwordNeedsReentry ? 'password-reentry' : null,
    destinationChanged ? 'password-destination' : null,
    passwordSaved && !destinationChanged ? 'password-saved' : null,
    'password-hint'
  ].filter(Boolean).join(' ');

  return (
    <div className="email-config-container">
      {saveSuccess && (
        <div className="success-message">
          <div className="success-icon" aria-hidden="true"><FontAwesomeIcon icon={faCheck} /></div>
          <div className="success-text">{saveMessage}</div>
        </div>
      )}
      
      {error && (
        <div className="error-message">
          <div className="error-icon" aria-hidden="true"><FontAwesomeIcon icon={faXmark} /></div>
          <div className="error-text">{error}</div>
        </div>
      )}
      
      <p className="config-description">
        Configure your email server settings to receive notifications about upcoming events.
        For services like Gmail, you'll need to create an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">App Password</a>.
      </p>
      
      <div className="outlook-warning">
        <strong>Important Note about Outlook/Microsoft:</strong> Microsoft has disabled basic authentication for email. 
        To use Outlook, you'll need to set up OAuth authentication, which requires registering an application in the 
        Microsoft Azure portal. For now, we recommend using Gmail or custom SMTP if you have a provider that supports basic authentication.
      </div>
      
      <form id={formId} onSubmit={handleSubmit} className="email-config-form">
        <div className="form-group">
          <label htmlFor="service">Email Service</label>
          <select 
            id="service" 
            name="service" 
            value={config.service} 
            onChange={handleServiceChange}
            disabled={loading}
          >
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook (Requires OAuth app - See Help)</option>
            <option value="yahoo">Yahoo</option>
            <option value="custom">Custom SMTP</option>
          </select>
        </div>

        {config.service === 'custom' && (
          <>
            <div className="form-group">
              <label htmlFor="host">SMTP Host</label>
              <input 
                type="text" 
                id="host" 
                name="host" 
                value={config.host} 
                onChange={handleChange}
                disabled={loading}
                required={config.service === 'custom'}
                placeholder="smtp.example.com"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="port">SMTP Port</label>
              <input 
                type="number" 
                id="port" 
                name="port" 
                value={config.port} 
                onChange={handleChange}
                disabled={loading}
                required={config.service === 'custom'}
                min="1"
                max="65535"
                placeholder="587"
              />
            </div>
            
            <div className="form-group checkbox-group">
              <label>
                <input 
                  type="checkbox" 
                  name="secure" 
                  checked={config.secure} 
                  onChange={handleChange}
                  disabled={loading}
                />
                Use Secure Connection (SSL/TLS)
              </label>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="requireTLS"
                  checked={Boolean(config.requireTLS)}
                  onChange={handleChange}
                  disabled={loading}
                />
                Require encryption (STARTTLS)
              </label>
              <small className="password-hint">
                Refuse to send if the server doesn't offer encryption. Leave on unless this is a relay on your own network.
              </small>
            </div>
          </>
        )}
        
        <div className="form-group">
          <label htmlFor="username">Email Address</label>
          <input 
            type="email" 
            id="username" 
            name="username" 
            value={config.username} 
            onChange={handleChange}
            disabled={loading}
            required
            placeholder="your.email@example.com"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">
            {passwordNeeded ? 'App Password' : 'New App Password (leave blank to keep current)'}
          </label>
          {config.passwordNeedsReentry && (
            <p id="password-reentry" className="password-hint" role="status">
              Your saved mail password can't be read on this server (for example after restoring a backup from another server). Please enter it again.
            </p>
          )}
          {passwordFieldError && (
            <p id="password-error" className="password-hint field-error" role="alert">{passwordFieldError}</p>
          )}
          {passwordSaved && !destinationChanged && !passwordFieldError && (
            <p id="password-saved" className="password-hint">A password is saved. Leave this empty to keep it.</p>
          )}
          {destinationChanged && !config.passwordNeedsReentry && (
            <p id="password-destination" className="password-hint" role="status">
              Enter the mail password again to change the server or email address.
            </p>
          )}
          <input 
            type="password" 
            id="password" 
            name="password" 
            value={config.password} 
            onChange={handleChange}
            disabled={loading}
            required={passwordNeeded}
            aria-invalid={passwordFieldError ? 'true' : undefined}
            aria-describedby={passwordNotes}
            placeholder="Your app password (not your regular account password)"
          />
          <small id="password-hint" className="password-hint">
            For services like Gmail, use an app password, not your regular account password.
          </small>
        </div>
        
        <div className="form-group">
          <label htmlFor="fromName">Sender Name</label>
          <input 
            type="text" 
            id="fromName" 
            name="fromName" 
            value={config.fromName} 
            onChange={handleChange}
            disabled={loading}
            placeholder="Gifty Notifications"
          />
        </div>
        
        <div className="form-group checkbox-group">
          <label>
            <input 
              type="checkbox" 
              name="enabled" 
              checked={config.enabled} 
              onChange={handleChange}
              disabled={loading}
            />
            Enable Email Notifications
          </label>
        </div>
        
      </form>
      {/* In the dialog these go to the sticky footer: the dismissive and
          destructive actions first, the main one last */}
      <ModalActions className="email-config-actions">
        {hasExistingConfig && (
          <>
            <button
              type="button"
              className="btn-danger"
              onClick={handleDelete}
              disabled={loading}
            >
              Delete Configuration
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleTestConfig}
              disabled={testLoading || loading}
            >
              {testLoading ? 'Sending...' : 'Send Test Email'}
            </button>
          </>
        )}
        <button
          type="submit"
          form={formId}
          className="btn-primary"
          disabled={loading}
        >
          {loading ? 'Saving...' : (hasExistingConfig ? 'Update Configuration' : 'Save Configuration')}
        </button>
      </ModalActions>
      {confirmDialog}
    </div>
  );
};

export default EmailConfig;
