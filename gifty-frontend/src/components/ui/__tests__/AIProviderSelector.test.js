import React from 'react';
import { render, screen } from '@testing-library/react';
import AIProviderSelector from '../AIProviderSelector';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../axiosInstance');

const catalog = {
  defaultProvider: 'openai',
  providers: [{ id: 'openai', label: 'OpenAI', available: true, models: [{ id: 'gpt-4o', label: 'GPT-4o' }] }],
};

describe('AIProviderSelector', () => {
  it('keeps its loaded shape while the catalog loads: title and two disabled fields', () => {
    axiosInstance.get.mockReturnValue(new Promise(() => {}));
    render(<AIProviderSelector provider="" model="" onChange={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'AI Model' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Provider' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/loading ai providers/i);
  });

  it('enables the provider field once the catalog arrives', async () => {
    axiosInstance.get.mockResolvedValue({ data: catalog });
    render(<AIProviderSelector provider="" model="" onChange={jest.fn()} />);

    expect(await screen.findByRole('option', { name: 'OpenAI' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Provider' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  describe('embedded (inside a section that already has the title)', () => {
    it('draws no card and no heading while loading', () => {
      axiosInstance.get.mockReturnValue(new Promise(() => {}));
      const { container } = render(<AIProviderSelector embedded provider="" model="" onChange={jest.fn()} />);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(container.firstChild).not.toHaveClass('container');
      expect(container.firstChild).toHaveClass('embedded');
      expect(screen.getByRole('combobox', { name: 'Provider' })).toBeDisabled();
    });

    it('draws no card and no heading once loaded', async () => {
      axiosInstance.get.mockResolvedValue({ data: catalog });
      const { container } = render(<AIProviderSelector embedded provider="" model="" onChange={jest.fn()} />);

      expect(await screen.findByRole('option', { name: 'OpenAI' })).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(container.firstChild).not.toHaveClass('container');
    });
  });
});
