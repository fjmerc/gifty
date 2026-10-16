// src/components/EditRecipientProfileWrapper.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axiosInstance from '../../../axiosInstance';
import EditRecipientProfileForm from '../../forms/js/EditRecipientProfileForm';
import RecipientNotFound from '../../ui/RecipientNotFound';


const EditRecipientProfileWrapper = () => {
  const [recipient, setRecipient] = useState(null);
  // null while loading, 'not-found' or 'failed'
  const [loadError, setLoadError] = useState(null);
  const { id } = useParams();

  useEffect(() => {
    const fetchRecipient = async () => {
      setRecipient(null);
      setLoadError(null);
      try {
        const response = await axiosInstance.get(`/recipients/${id}`);
        setRecipient(response.data);
      } catch (error) {
        console.error('Error fetching recipient:', error);
        setLoadError(error.response?.status === 404 ? 'not-found' : 'failed');
      }
    };
    fetchRecipient();
  }, [id]);

  if (loadError === 'not-found') return <RecipientNotFound />;
  if (loadError) return <p role="alert">Failed to load data. Please try again.</p>;
  if (!recipient) {
    return <div>Loading...</div>;
  }

  return <EditRecipientProfileForm recipient={recipient} />;
};

export default EditRecipientProfileWrapper;