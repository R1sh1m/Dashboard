import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LeftSidebar } from '../components/LeftSidebar';

const mockProps = {
  botState: 'STANDBY',
  isEStop: false,
  serialStatus: 'DISCONNECTED' as const,
  activeNav: 'home' as const,
  setActiveNav: vi.fn(),
  onOpenSensors: vi.fn(),
  onHome: vi.fn(),
  onSavePoi: vi.fn(),
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockProps.setActiveNav.mockClear();
  mockProps.onOpenSensors.mockClear();
  mockProps.onHome.mockClear();
  mockProps.onSavePoi.mockClear();
});

describe('LeftSidebar — button handlers', () => {
  it('calls setActiveNav("home") and onHome when Home button is clicked', () => {
    render(<LeftSidebar {...mockProps} />);

    const homeBtn = screen.getByRole('button', { name: /^home$/i });
    fireEvent.click(homeBtn);

    expect(mockProps.setActiveNav).toHaveBeenCalledWith('home');
    expect(mockProps.onHome).toHaveBeenCalledTimes(1);
  });

  it('calls setActiveNav("saved") and onSavePoi when Saved locations is clicked', () => {
    render(<LeftSidebar {...mockProps} />);

    const savedBtn = screen.getByRole('button', { name: /points of interest/i });
    fireEvent.click(savedBtn);

    expect(mockProps.setActiveNav).toHaveBeenCalledWith('saved');
    expect(mockProps.onSavePoi).toHaveBeenCalledTimes(1);
  });

  it('calls setActiveNav("telemetry") and onOpenSensors when Telemetry is clicked', () => {
    render(<LeftSidebar {...mockProps} />);

    const telemetryBtn = screen.getByRole('button', { name: /^Telemetry$/ });
    fireEvent.click(telemetryBtn);

    expect(mockProps.setActiveNav).toHaveBeenCalledWith('telemetry');
    expect(mockProps.onOpenSensors).toHaveBeenCalledTimes(1);
  });

  it('marks Home button active when activeNav is home', () => {
    render(<LeftSidebar {...mockProps} activeNav="home" />);

    const homeBtn = screen.getByRole('button', { name: /^home$/i });
    expect(homeBtn).toHaveAttribute('aria-current', 'page');
  });

  it('marks Saved locations button active when activeNav is saved', () => {
    render(<LeftSidebar {...mockProps} activeNav="saved" />);

    const savedBtn = screen.getByRole('button', { name: /points of interest/i });
    expect(savedBtn).toHaveAttribute('aria-current', 'page');
  });
});
