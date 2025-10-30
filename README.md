# Kannako Homes Website

A modern, responsive single-page website for Kannako Homes - Making Dreams Into Reality.

## Features

- **Modern Design**: Clean white background with turquoise accents and charcoal text
- **Fully Responsive**: Mobile-first design that works on all devices
- **Interactive Elements**: Smooth scrolling, hover effects, and mobile menu
- **SEO Optimized**: Proper meta tags and semantic HTML structure
- **Performance Optimized**: Lazy loading, debounced scroll events, and optimized images

## Color Scheme

- **Primary Color**: #1BC0C8 (Turquoise)
- **Primary Dark**: #17a9ab (Darker turquoise for hover states)
- **Text Color**: #333333 (Charcoal)
- **Background**: #FFFFFF (White)
- **Light Background**: #f9f9f9 (Very light grey)

## Sections Included

1. **Hero Section**: Full-width banner with company name and call-to-action
2. **Navigation**: Sticky navigation with smooth scrolling
3. **About Section**: Two-column layout with image and text
4. **Services Section**: Three service cards with hover effects
5. **Portfolio Section**: Grid of featured projects with overlay effects
6. **Why Choose Us**: Value proposition with icons
7. **Testimonials**: Client testimonials with photos
8. **Contact Section**: Contact form and company information
9. **Footer**: Links, social media, and copyright information

## Customization Guide

### Replacing Images

1. **Hero Image**: Replace the background image in the `.hero-image` CSS class
2. **About Image**: Update the `src` attribute in the about section
3. **Portfolio Images**: Replace the `src` attributes in the portfolio grid
4. **Testimonial Photos**: Update the `src` attributes in the testimonials section

### Updating Content

1. **Company Information**: Update contact details in the contact section
2. **Services**: Modify the service cards in the services section
3. **Testimonials**: Replace with real client testimonials
4. **About Text**: Customize the mission statement and company description

### Color Customization

To change the color scheme, update the CSS variables in `styles.css`:

```css
:root {
    --primary-color: #1BC0C8;    /* Main turquoise */
    --primary-dark: #17a9ab;      /* Darker turquoise */
    --text-color: #333333;        /* Charcoal text */
    --text-light: #666666;        /* Light grey text */
    --background-white: #FFFFFF; /* White background */
    --background-light: #f9f9f9;  /* Light grey background */
    --charcoal: #444444;          /* Dark grey */
}
```

### Font Customization

The website uses Google Fonts:
- **Headings**: Montserrat (modern, bold sans-serif)
- **Body Text**: Open Sans (clean, readable sans-serif)

To change fonts, update the Google Fonts link in the HTML head and modify the font-family declarations in CSS.

## File Structure

```
Kannako Homes website/
├── index.html          # Main HTML file
├── styles.css         # CSS styles and responsive design
├── script.js          # JavaScript functionality
└── README.md          # This file
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Features

- **Lazy Loading**: Images load only when needed
- **Debounced Scroll Events**: Optimized scroll performance
- **CSS Transitions**: Smooth animations without JavaScript
- **Optimized Images**: Compressed images from Unsplash
- **Minimal Dependencies**: Only Google Fonts and Font Awesome icons

## Deployment Options

### Static Hosting (Recommended)
- **Netlify**: Drag and drop the files
- **Vercel**: Connect to GitHub repository
- **GitHub Pages**: Free hosting for static sites

### WordPress Integration
1. Create a custom theme
2. Convert HTML sections to WordPress template parts
3. Use Advanced Custom Fields for content management

### CMS Integration
- **Strapi**: Headless CMS for content management
- **Contentful**: Cloud-based content management
- **Sanity**: Real-time collaborative editing

## SEO Checklist

- ✅ Semantic HTML structure
- ✅ Meta title and description
- ✅ Alt text for all images
- ✅ Proper heading hierarchy (H1, H2, H3)
- ✅ Mobile-friendly design
- ✅ Fast loading times
- ✅ Clean URL structure

## Analytics Setup

Add Google Analytics tracking code before the closing `</head>` tag:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_TRACKING_ID');
</script>
```

## Contact Form Integration

The contact form currently shows a success message. To make it functional:

1. **Netlify Forms**: Add `netlify` attribute to the form tag
2. **Formspree**: Replace the form action with Formspree endpoint
3. **EmailJS**: Use EmailJS for client-side email sending
4. **Backend Integration**: Connect to your server/API

## Future Enhancements

- [ ] Blog section for company updates
- [ ] Project gallery with filtering
- [ ] Online quote calculator
- [ ] Virtual tour integration
- [ ] Multi-language support
- [ ] Dark mode toggle
- [ ] Advanced animations
- [ ] Progressive Web App features

## Support

For questions or customization help, please contact the development team.

---

**© 2025 Kannako Homes. All rights reserved.**
