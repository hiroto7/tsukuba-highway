import React from 'react';
import { Card, ListGroup } from 'react-bootstrap';

const RoadList: React.FC<{ roads: Iterable<string>, selected?: string, onClick: (road: string) => void }> = props => (
  <Card>{
    <ListGroup variant="flush">
      {
        [...props.roads].map((roadName: string) => (
          <ListGroup.Item action active={roadName === props.selected} key={roadName} onClick={() => props.onClick(roadName)}>{roadName}</ListGroup.Item>
        ))
      }
    </ListGroup>
  }</Card>
)

export default RoadList;