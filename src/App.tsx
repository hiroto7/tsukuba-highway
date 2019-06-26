import React from 'react';
import './App.css';
import { Map, Marker, TileLayer, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Container, Row, Col, Navbar, Card, Spinner, Table } from 'react-bootstrap';
import RoadList from './RoadList';
import L from 'leaflet';

interface SPARQLQueryResults<V extends string = never, W extends string = never> {
  head: { vars: (V | W)[] },
  results: {
    bindings: Binding<V, W>[]
  }
}

type RDFTerm = { "type": "uri", "value": string }
  | { "type": "literal", "value": string }
  | { "type": "literal", "value": string, "xml:lang": string }
  | { "type": "literal", "value": string, "datatype": string }
  | { "type": "bnode", "value": string }
type Binding<V extends string = never, W extends string = never> = { [P in V]: RDFTerm; } & { [P in W]?: RDFTerm; }

interface Point {
  coordinate: { lat: number, lng: number };
  names: Iterable<string>;
}

const endpoint = 'http://localhost:3030/tsukuba-highway/query';

export default class App extends React.Component<{}, {
  isLoading: boolean,
  roadNames: Iterable<string> | null,
  road: {
    name: string,
    length: number,
    lanesCounts: Iterable<number>,
    start: Point,
    end: Point
  } | null,
  map: {
    zoom: number,
    center: { lat: number, lng: number }
  }
}> {
  constructor(props: {}) {
    super(props);
    this.state = { isLoading: false, roadNames: [], road: null, map: { zoom: 13, center: { lat: 36.0824938, lng: 140.0958208 } } };
  }

  componentDidMount() {
    this.updateRoadList();
  }

  async updateRoadList() {
    try {
      this.setState({ isLoading: true });

      const query = `prefix bp: <http://www.coins.tsukuba.ac.jp/~s1711402/lod/mylod/property/>
prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>

select distinct * where {
  ?road bp:category "road" ;
    rdfs:label ?roadLabel .
}`;
      const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/sparql-results+json' } });
      const text = await response.text();

      try {
        const json: SPARQLQueryResults<'road' | 'roadLabel'> = JSON.parse(text);
        const roads = json.results.bindings.map(binding => (binding.roadLabel.value));
        this.setState({ roadNames: roads });
      } catch (e) {
        console.error(text);
        throw e;
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.setState({ isLoading: false });
    }
  }

  async getRoadDetails(roadName: string) {
    try {
      this.setState({ isLoading: true });

      const queries = [
        /* queries[0] */
        `prefix bp: <http://www.coins.tsukuba.ac.jp/~s1711402/lod/mylod/property/>
prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>
prefix ic: <http://imi.go.jp/ns/core/rdf#>

select distinct ?start_lng ?start_lat ?end_lng ?end_lat ?length ?lanes_count where {
  ?road bp:category "road" ;
    rdfs:label "${roadName}"@ja ;
    bp:起点 ?start ;
    bp:終点 ?end ;
    bp:length ?length ;
    bp:車線数 ?lanes_count .
  {
    ?start ic:経度 ?start_lng .
    ?start ic:緯度 ?start_lat .
    bind(2 as ?start_priority) .
  } union {
    ?start ic:座標 ?start_coordinate .
    ?start_coordinate ic:経度 ?start_lng .
    ?start_coordinate ic:緯度 ?start_lat .
    bind(1 as ?start_priority) .
  }

  {
    ?end ic:経度 ?end_lng .
    ?end ic:緯度 ?end_lat .
    bind(2 as ?end_priority) .
  } union {
    ?end ic:座標 ?end_coordinate .
    ?end_coordinate ic:経度 ?end_lng .
    ?end_coordinate ic:緯度 ?end_lat .
    bind(1 as ?end_priority) .
  }

  filter(str(?end_lng) != "") .
  filter(str(?end_lat) != "") .
  filter(str(?start_lng) != "") .
  filter(str(?start_lat) != "") .
} order by desc(?start_priority) desc(?end_priority)`,

        /* queries[1] */
        `prefix bp: <http://www.coins.tsukuba.ac.jp/~s1711402/lod/mylod/property/>
prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>

select distinct ?start_name ?end_name where {
  ?road bp:category "road" ;
    rdfs:label "${roadName}"@ja .
  {
    ?road bp:起点 ?start_name .
    filter(isliteral(?start_name)) .
  } union {
    ?road bp:起点 ?start .
    ?start rdfs:label ?start_name .
  }
  
  {
    ?road bp:終点 ?end_name .
    filter(isliteral(?end_name)) .
  } union {
    ?road bp:終点 ?end .
    ?end rdfs:label ?end_name .
  }
}`
      ] as const;
      const texts = await Promise.all(queries.map(async query => {
        const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/sparql-results+json' } });
        const text = await response.text();
        return text;
      }));

      try {
        const json = texts.map(text => JSON.parse(text)) as [
          SPARQLQueryResults<'start_lng' | 'start_lat' | 'end_lng' | 'end_lat' | 'length' | 'lanes_count'>,
          SPARQLQueryResults<'start_name' | 'end_name'>
        ];

        const start: Point = {
          coordinate: {
            lat: +json[0].results.bindings[0].start_lat.value,
            lng: +json[0].results.bindings[0].start_lng.value
          },
          names: new Set(json[1].results.bindings.map(binding => binding.start_name.value))
        }
        const end: Point = {
          coordinate: {
            lat: +json[0].results.bindings[0].end_lat.value,
            lng: +json[0].results.bindings[0].end_lng.value
          },
          names: new Set(json[1].results.bindings.map(binding => binding.end_name.value))
        }

        const length = +json[0].results.bindings[0].length.value;
        const lanesCounts = new Set(json[0].results.bindings.map(binding => +binding.lanes_count.value));

        this.setState({
          road: {
            name: roadName,
            length, lanesCounts, start, end
          },
          map: {
            ...this.state.map,
            center: {
              lat: (start.coordinate.lat + end.coordinate.lat) / 2,
              lng: (start.coordinate.lng + end.coordinate.lng) / 2
            }
          }
        });
      } catch (e) {
        console.error(texts);
        throw e;
      }

    } catch (e) {
      console.error(e);
    } finally {
      this.setState({ isLoading: false });
    }
  }

  render() {
    return (
      <div className="App">
        <Navbar variant="dark" bg="dark" className="justify-content-between">
          <Navbar.Brand>つくば市周辺の幹線道路</Navbar.Brand>
          {this.state.isLoading ? (<Spinner animation="border" variant="primary" />) : ''}
        </Navbar>
        <main>
          <Container fluid className="my-3">
            <Row>
              <Col xs={12} sm={6} md={3} xl={2}>{
                this.state.roadNames === null ? '' : (
                  <RoadList selected={this.state.road === null ? undefined : this.state.road.name} roads={this.state.roadNames} onClick={roadName => this.getRoadDetails(roadName)} />
                )
              }</Col>
              <Col xs={12} sm={6} md={{ span: 4, offset: 5 }} xl={{ span: 3, offset: 7 }}>{
                this.state.road === null ? '' : (
                  <Card>
                    <Card.Header>{this.state.road.name}</Card.Header>
                    <Table className="mb-0">
                      <tbody>
                        <tr>
                          <th>長さ</th><td className="text-right">{this.state.road.length} km</td>
                        </tr>
                        <tr>
                          <th>車線数</th><td className="text-right">{[...this.state.road.lanesCounts].join(' / ')}</td>
                        </tr>
                        <tr>
                          <th>起点</th>
                          <td className="text-right">{
                            [...this.state.road.start.names].map(name => (<div key={name}>{name}</div>))
                          }</td>
                        </tr>
                        <tr>
                          <th>終点</th>
                          <td className="text-right">{
                            [...this.state.road.end.names].map(name => (<div key={name}>{name}</div>))
                          }</td>
                        </tr>
                      </tbody>
                    </Table>
                  </Card>
                )
              }</Col>
            </Row>
          </Container>

          <Map zoom={this.state.map.zoom} zoomControl={false}
            center={this.state.map.center}
            onZoom={({ target }: { target: L.Map }) => this.setState({ map: { ...this.state.map, zoom: target.getZoom() } })}
            onMoveEnd={({ target }: { target: L.Map }) => this.setState({ map: { ...this.state.map, center: target.getCenter() } })}>
            <ZoomControl position="bottomright" />
            <TileLayer
              url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
              attribution="<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"
            />
            {
              this.state.road === null || !('start' in this.state.road) ? '' : (
                <>
                  <Marker position={this.state.road.start.coordinate}>
                    <Popup>
                      <h6>起点</h6>
                      {[...this.state.road.start.names].map(name => (<div key={name}>{name}</div>))}
                      <div>{this.state.road.start.coordinate.lat}, {this.state.road.start.coordinate.lng}</div>
                    </Popup>
                  </Marker>

                  <Marker position={this.state.road.end.coordinate}>
                    <Popup>
                      <h6>終点</h6>
                      {[...this.state.road.end.names].map(name => (<div key={name}>{name}</div>))}
                      <div>{this.state.road.end.coordinate.lat}, {this.state.road.end.coordinate.lng}</div>
                    </Popup>
                  </Marker>
                </>
              )
            }
          </Map>
        </main>
      </div >
    );
  }
}