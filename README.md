# lens-3d-view-experimental

## Overview

This project is an experimental Kubernetes Lens extension that provides an interactive 3D visualization of Kubernetes resources. Explore and monitor your Kubernetes environment in a dynamic and engaging 3D space.

**Note:** This project is in an experimental phase. Features may change, and it is not recommended for production use.

## Features

- **3D Visualization**: Provides a 3D representation of nodes and pods, enabling real-time visualization of their statuses within the Kubernetes cluster.
- **Interactive Controls**: Users can easily navigate the 3D space using mouse controls, clicking on nodes or pods to display relevant detailed information.
- **Default Position Reset**: A dedicated button to reset the camera position to its initial setup for a consistent viewing experience.
- **Seamless Integration**: Designed to work seamlessly as an extension within the Lens interface, enhancing user experience with minimal disruption.

## Usage

- Launch Lens and open the 3D View extension.
- The extension will display the nodes and podsof the Kubernetes cluster in a 3D space.
- Click on nodes or pods to view detailed information about each respective resource.
- Use the “Default Position Reset” button to return the camera’s view to the initial position for a better overview.

## Software Requirements

- Lens IDE
- Node.js

## Demo

![Demo](img/demo.gif)  <!-- Specify the path to the demo video or GIF -->

## Installation

To install this Kubernetes Lens extension, follow these steps:

### build the extension
1. Clone the repository.
   ```bash
   git clone https://github.com/kmhk-ab/lens-3d-view-experimental.git
   cd lens-3d-view-experimental
2. Install the required dependencies.
   ```bash
   npm install
3. Build the extension.
   ```bash
   npm run build

### Install to Lens
For instructions on how to install the extension in Lens, please refer to the official documentation and follow the necessary operations outlined here: [Install the Extension](https://api-docs.k8slens.dev/v6.0.1/extensions/get-started/your-first-extension/#install-the-extension).

**Note:** Extension name is "lens-3d-view-experimental"
