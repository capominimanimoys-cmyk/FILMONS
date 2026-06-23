import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { MapPin, X } from 'lucide-react';
import { toast } from 'sonner';

interface LocationPermissionDialogProps {
  onLocationGranted: (location: { latitude: number; longitude: number; city?: string }) => void;
  onLocationDenied: () => void;
}

export function LocationPermissionDialog({ onLocationGranted, onLocationDenied }: LocationPermissionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    // Check if user has already made a location decision
    const locationPermission = localStorage.getItem('filmons_location_permission');
    const userLocation = localStorage.getItem('filmons_user_location');

    if (!locationPermission && !userLocation) {
      // Show dialog after a short delay for better UX
      setTimeout(() => {
        setIsOpen(true);
      }, 1000);
    } else if (locationPermission === 'granted' && userLocation) {
      // Auto-load saved location
      try {
        const location = JSON.parse(userLocation);
        onLocationGranted(location);
      } catch (error) {
        console.error('Error parsing saved location:', error);
      }
    }
  }, [onLocationGranted]);

  const requestLocation = async () => {
    setIsRequesting(true);

    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      handleDeny();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // Try to get city name using reverse geocoding (OpenStreetMap Nominatim API)
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await response.json();
          
          const city = data.address?.city || 
                      data.address?.town || 
                      data.address?.village || 
                      data.address?.county || 
                      'Unknown';

          const locationData = { latitude, longitude, city };

          // Save to localStorage
          localStorage.setItem('filmons_location_permission', 'granted');
          localStorage.setItem('filmons_user_location', JSON.stringify(locationData));

          onLocationGranted(locationData);
          setIsOpen(false);
          
          toast.success(`Location detected: ${city}`, {
            description: 'Showing items near you',
          });
        } catch (error) {
          console.error('Error getting city name:', error);
          
          // Save location without city name
          const locationData = { latitude, longitude };
          localStorage.setItem('filmons_location_permission', 'granted');
          localStorage.setItem('filmons_user_location', JSON.stringify(locationData));

          onLocationGranted(locationData);
          setIsOpen(false);
          
          toast.success('Location detected', {
            description: 'Showing items near you',
          });
        } finally {
          setIsRequesting(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error.message || 'Unknown error', {
          code: error.code,
          message: error.message
        });
        
        if (error.code === 1) { // PERMISSION_DENIED
          toast.error('Location access denied', {
            description: 'You can still browse all listings',
          });
        } else if (error.code === 2) { // POSITION_UNAVAILABLE
          toast.error('Location unavailable', {
            description: 'Unable to determine your location',
          });
        } else if (error.code === 3) { // TIMEOUT
          toast.error('Location request timed out', {
            description: 'Please try again',
          });
        } else {
          toast.error('Unable to get your location', {
            description: 'You can still browse all listings',
          });
        }
        
        handleDeny();
        setIsRequesting(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      }
    );
  };

  const handleDeny = () => {
    localStorage.setItem('filmons_location_permission', 'denied');
    onLocationDenied();
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <MapPin className="w-6 h-6 text-blue-600" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeny}
              className="absolute right-4 top-4"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <DialogTitle className="text-xl">Find Items Near You</DialogTitle>
          <DialogDescription className="text-base">
            Allow Filmons to access your location to show film gear and services available near you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-start gap-3 text-sm">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-600 font-bold text-xs">✓</span>
            </div>
            <p className="text-gray-600">See items closest to you first</p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-600 font-bold text-xs">✓</span>
            </div>
            <p className="text-gray-600">Find nearby services and rentals</p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-600 font-bold text-xs">✓</span>
            </div>
            <p className="text-gray-600">Save time on pickup and delivery</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={requestLocation}
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={isRequesting}
          >
            {isRequesting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Getting Location...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4 mr-2" />
                Allow Location Access
              </>
            )}
          </Button>
          <Button
            onClick={handleDeny}
            variant="outline"
            className="w-full"
          >
            Not Now
          </Button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-2">
          Your location is only used to sort listings and is never shared publicly.
        </p>
      </DialogContent>
    </Dialog>
  );
}